import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { migrate } from '../db/migrate';
import { loadAnkiDataset } from '../db/load';
import { ensureAnkiScope, linkAnkiNote, saveAnkiSnapshot } from '../db/ankiRepo';
import { getError, unmarkAnkiAdded, updateError, deleteError } from '../db/repo';
import { ankiNote, ankiReview, errorRow, session } from '../db/schema';
import { ankiContentStale, createAnkiNote, ERRORLOG_FIELDS, escapeAnkiHtml, notePredatesError, updateAnkiNote } from './create';
import { AnkiError, type Transport } from './connect';
import { ankiStatus, batches, syncAnki, withAnkiLock } from './sync';
import { CONFIG, NOW, REVIEW, ROLLOVER, FakeAnki, ankiFixture, review, card, note } from './fixtures/build';

let db: Db;
let fake: FakeAnki;
beforeEach(() => {
  db = createDb(':memory:'); migrate(db); fake = new FakeAnki();
  db.insert(session).values({ id: 1, date: '2026-09-22', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', itemsTotal: 1, itemsCorrect: 0 }).run();
  db.insert(errorRow).values({ id: 1, sessionId: 1, prompt: 'I ___ it', myAnswer: 'did', correctAnswer: 'made', cause: 'CONFUSION', category: 'COLOCACION', confidence: 'DUDABA', ruleNote: 'Contrasta make con do según el sustantivo.' }).run();
});
afterEach(() => db.$client.close());

it('sincroniza por lotes, incluye submazos y cartas nuevas, y no crea mazos al leer', async () => {
  const result = await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(result).toEqual({ reviews: 1, newReviews: 1, notes: 1, cards: 1, rollover: { hour: 4, source: 'anki' } });
  expect(fake.calls.find((call) => call.action === 'findCards')?.params['query']).not.toContain('is:new');
  expect(fake.calls.some((call) => /^(create|add|delete)/.test(call.action))).toBe(false);
  expect(loadAnkiDataset(db)).toMatchObject({ sync: { profile: 'Juan', lastSyncedAt: NOW.toISOString() } });
  expect(db.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(batches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  expect(fake.calls.filter((call) => call.action === 'multi')).toHaveLength(1);
});
it('fecha los repasos con el corte de día de Anki, no con la medianoche civil', async () => {
  // 00:30 local: con corte a las 4 pertenece al día anterior; con corte a 0, al mismo.
  const lateNight = new Date(2026, 8, 22, 0, 30).getTime();
  fake.reviews['10'] = [review({ id: lateNight })];
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(loadAnkiDataset(db)).toMatchObject({ reviews: [{ reviewDate: '2026-09-21' }], sync: { rolloverHour: 4, rolloverSource: 'anki' } });

  fake.rollover = 0;
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(loadAnkiDataset(db)).toMatchObject({ reviews: [{ reviewDate: '2026-09-22' }], sync: { rolloverHour: 0, rolloverSource: 'anki' } });

  // Lo declarado a mano gana sobre lo que diga la colección.
  await syncAnki(db, fake.transport, NOW, { ...CONFIG, rolloverHour: 9 });
  expect(loadAnkiDataset(db)).toMatchObject({ sync: { rolloverHour: 9, rolloverSource: 'config' } });
});

it('una versión de AnkiConnect sin getPreferences no impide sincronizar', async () => {
  // Es el caso real: la instalación verificada responde «unsupported action».
  fake.failAction = 'getPreferences';
  expect((await syncAnki(db, fake.transport, NOW, CONFIG)).rollover).toEqual({ hour: 4, source: 'default' });
  expect(loadAnkiDataset(db).sync).toMatchObject({ rolloverHour: 4, rolloverSource: 'default' });

  // Y con la hora declarada a mano, esa misma versión sí usa el corte correcto.
  await syncAnki(db, fake.transport, NOW, { ...CONFIG, rolloverHour: 2 });
  expect(loadAnkiDataset(db).sync).toMatchObject({ rolloverHour: 2, rolloverSource: 'config' });
});

it('no duplica repasos y admite backfill más antiguo y deshacer en Anki', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const before = loadAnkiDataset(db);
  expect((await syncAnki(db, fake.transport, NOW, CONFIG)).newReviews).toBe(0);
  expect(loadAnkiDataset(db)).toEqual(before);
  fake.reviews['10']!.push(review({ id: REVIEW - 86400000 }));
  expect((await syncAnki(db, fake.transport, NOW, CONFIG)).newReviews).toBe(1);
  fake.reviews['10'] = [];
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(loadAnkiDataset(db).reviews).toEqual([]);
});
it('retira del espejo las cartas fuera del mazo, sin mezclar el historial de otra colección', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  fake.cards = [];
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(loadAnkiDataset(db).cards).toEqual([]);
  expect(loadAnkiDataset(db).reviews).toEqual([]);
  expect(loadAnkiDataset(db).sync?.notesSeen).toBe(0);
});
it('solo devuelve la deuda cuando notesInfo confirma que la nota vinculada no existe', async () => {
  const nid = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  // Nota fuera del mazo buscado: sigue existiendo, no debe volver a la cola.
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(getError(db, 1)?.ankiAdded).toBe(true);
  fake.notes.delete(nid);
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(getError(db, 1)).toMatchObject({ ankiNoteId: null, ankiAdded: false, ankiAddedAt: null });
});

it.each([true, false])('rechaza otra colección con el mismo perfil, URL, mazos y un note_id coincidente (en mazo: %s)', async (inDeck) => {
  const ids = await convertThree();
  const before = loadAnkiDataset(db);
  const errors = db.select().from(errorRow).all();
  const other = new FakeAnki();
  // Una colisión basta para engañar al antiguo guard de desaparición total.
  const collided = fake.notes.get(ids[0]!)!;
  other.notes.set(collided.noteId, { ...collided, fields: {
    ...collided.fields, ErrorLogId: { value: 'errorlog::otra-coleccion::1', order: 0 },
  } });
  if (inDeck) other.cards.push(card({ cardId: 11, note: collided.noteId }));
  await expect(syncAnki(db, other.transport, NOW, CONFIG)).rejects.toMatchObject({
    code: 'ANKI_CONFIG', message: expect.stringContaining('DB_FILE_OVERRIDE'),
  });
  expect(loadAnkiDataset(db)).toEqual(before);
  expect(db.select().from(errorRow).all()).toEqual(errors);
});

it.each(['missing', 'empty', 'wrong-error', 'html'])('un vínculo válido no oculta otro ErrorLogId incorrecto: %s', async (mode) => {
  const ids = await convertThree();
  const before = loadAnkiDataset(db);
  const errors = db.select().from(errorRow).all();
  const changed = fake.notes.get(ids[1]!)!;
  const fields = { ...changed.fields };
  const identity = fields['ErrorLogId']!.value;
  if (mode === 'missing') delete fields['ErrorLogId'];
  else fields['ErrorLogId'] = { order: 0, value: mode === 'empty' ? ''
    : mode === 'wrong-error' ? identity.replace(/::2$/, '::1') : `<b>${identity}</b>` };
  fake.notes.set(changed.noteId, { ...changed, fields });
  fake.notes.delete(ids[2]!);
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  expect(loadAnkiDataset(db)).toEqual(before);
  expect(db.select().from(errorRow).all()).toEqual(errors);
});
/** Tres errores convertidos: el minimo con el que perderlos todos deja de ser una limpieza. */
async function convertThree(): Promise<number[]> {
  for (const id of [2, 3]) {
    db.insert(errorRow).values({ id, sessionId: 1, prompt: `I ___ it (${String(id)})`, myAnswer: 'did',
      correctAnswer: 'made', cause: 'CONFUSION', category: 'COLOCACION', confidence: 'DUDABA',
      ruleNote: 'Contrasta make con do según el sustantivo.' }).run();
  }
  const noteIds: number[] = [];
  for (const id of [1, 2, 3]) noteIds.push(await createAnkiNote(db, id, fake.transport, NOW, CONFIG));
  await syncAnki(db, fake.transport, NOW, CONFIG);
  return noteIds;
}

it('se niega a vaciar el historial cuando Anki no reconoce ninguna nota vinculada', async () => {
  const noteIds = await convertThree();
  const before = loadAnkiDataset(db);
  // Perfil, endpoint y mazo intactos: es otra coleccion restaurada bajo el mismo nombre.
  for (const noteId of noteIds) fake.notes.delete(noteId);
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  expect([1, 2, 3].map((id) => getError(db, id)?.ankiAdded)).toEqual([true, true, true]);
  expect([1, 2, 3].map((id) => getError(db, id)?.ankiAddedAt)).not.toContain(null);
  expect(loadAnkiDataset(db)).toEqual(before);
});

it('devuelve a la cola las notas borradas de verdad mientras quede alguna reconocible', async () => {
  const noteIds = await convertThree();
  fake.notes.delete(noteIds[0]!);
  fake.notes.delete(noteIds[1]!);
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(getError(db, 1)).toMatchObject({ ankiNoteId: null, ankiAdded: false, ankiAddedAt: null });
  expect(getError(db, 2)).toMatchObject({ ankiNoteId: null, ankiAdded: false, ankiAddedAt: null });
  expect(getError(db, 3)).toMatchObject({ ankiNoteId: noteIds[2]!, ankiAdded: true });
});

it('reencuentra la nota por su campo cuando el tag de identidad se ha perdido', async () => {
  const nid = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  const created = fake.notes.get(nid)!;
  const identity = created.fields['ErrorLogId']!.value;

  // «Borrar tags no usados», un renombrado o una edición a mano dejan la nota sin el tag.
  fake.notes.set(nid, { ...created, tags: created.tags.filter((tag) => tag !== identity) });
  unmarkAnkiAdded(db, 1);
  expect(getError(db, 1)?.ankiNoteId).toBeNull();

  // Sin la búsqueda por campo esto acababa en «duplicada» y sin forma de salir.
  expect(await createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).toBe(nid);
  expect(getError(db, 1)).toMatchObject({ ankiNoteId: nid, ankiAdded: true });
  expect(fake.added).toBe(1);
  const query = String(fake.calls.filter((call) => call.action === 'findNotes').at(-1)?.params['query']);
  expect(query).toContain(`tag:"${identity}"`);
  expect(query).toContain(`"ErrorLogId:${identity}"`);
});

it('la identidad no confunde a dos errores con prefijo común', async () => {
  db.insert(errorRow).values({ id: 12, sessionId: 1, prompt: 'otro', myAnswer: 'x', correctAnswer: 'y',
    cause: 'CONFUSION', category: 'COLOCACION', confidence: 'DUDABA',
    ruleNote: 'Contrasta make con do según el sustantivo.' }).run();
  const first = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  const second = await createAnkiNote(db, 12, fake.transport, NOW, CONFIG);
  expect(second).not.toBe(first);
  expect(fake.added).toBe(2);
});

/** El error 1, ya convertido, con su enunciado corregido después. */
async function convertThenEdit(): Promise<number> {
  const noteId = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  const before = getError(db, 1)!;
  expect(ankiContentStale(before, ensureAnkiScope(db, CONFIG, 'Juan').namespace, CONFIG.targetDeck)).toBe(false);
  db.update(errorRow).set({ correctAnswer: 'taken' }).where(eq(errorRow.id, 1)).run();
  return noteId;
}

it('avisa de que la tarjeta quedó vieja al corregir un error ya convertido', async () => {
  await convertThenEdit();
  const namespace = ensureAnkiScope(db, CONFIG, 'Juan').namespace;
  // El vínculo sigue, pero la tarjeta ya no dice lo que dice el error.
  expect(getError(db, 1)?.ankiAdded).toBe(true);
  expect(ankiContentStale(getError(db, 1)!, namespace, CONFIG.targetDeck)).toBe(true);
});

it('actualizar reescribe los campos en Anki y deja de avisar', async () => {
  const noteId = await convertThenEdit();
  const namespace = ensureAnkiScope(db, CONFIG, 'Juan').namespace;
  const duringUpdate = fake.calls.length;
  expect(await updateAnkiNote(db, 1, fake.transport, CONFIG)).toBe(noteId);
  expect(fake.notes.get(noteId)?.fields['Correct']?.value).toBe('taken');
  expect(ankiContentStale(getError(db, 1)!, namespace, CONFIG.targetDeck)).toBe(false);
  // Actualizar no crea una segunda nota, ni mazos, ni tipos de nota, ni borra nada.
  expect(fake.added).toBe(1);
  expect(fake.calls.slice(duringUpdate).map((call) => call.action).filter((action) => /^(create|add|delete)/.test(action))).toEqual([]);
});

it.each([
  ['modelNames', 'createModel'],
  ['modelFieldNames', 'createDeck'],
  ['createDeck', 'addNote'],
])('comprueba el perfil antes de %s → %s', async (afterRead, write) => {
  const transport: Transport = async (request) => {
    const result = await fake.transport(request);
    if (request.action === afterRead) fake.profile = 'Otro';
    return result;
  };
  await expect(createAnkiNote(db, 1, transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  expect(fake.calls.some(({ action }) => action === write)).toBe(false);
  expect(getError(db, 1)?.ankiAdded).toBe(false);
});

it.each([1, 2])('no escribe ni sella en otro perfil tras la lectura de nota número %s', async (switchAt) => {
  await convertThenEdit();
  const before = getError(db, 1);
  const start = fake.calls.length;
  let reads = 0;
  const transport: Transport = async (request) => {
    const result = await fake.transport(request);
    if (request.action === 'notesInfo' && ++reads === switchAt) fake.profile = 'Otro';
    return result;
  };
  await expect(updateAnkiNote(db, 1, transport, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  expect(getError(db, 1)).toEqual(before);
  expect(fake.calls.slice(start).filter(({ action }) => action === 'updateNoteFields')).toHaveLength(switchAt - 1);
});

it.each(ERRORLOG_FIELDS)('no sella la huella si Anki acepta actualizar pero no confirma %s', async (field) => {
  const noteId = await convertThenEdit();
  const before = getError(db, 1)!;
  fake.override = ({ action, params }) => {
    if (action !== 'updateNoteFields') return undefined;
    const input = params['note'] as { fields: Record<string, string> };
    const existing = fake.notes.get(noteId)!;
    // Devuelve éxito y actualiza los demás campos: una lectura de existencia no basta.
    fake.notes.set(noteId, { ...existing, fields: Object.fromEntries(Object.entries(input.fields)
      .map(([name, value], order) => [name, { order, value: name === field ? 'valor sin actualizar' : value }])) });
    return { result: null, error: null };
  };
  await expect(updateAnkiNote(db, 1, fake.transport, CONFIG)).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
  expect(getError(db, 1)).toEqual(before);
  expect(ankiContentStale(getError(db, 1)!, ensureAnkiScope(db, CONFIG, 'Juan').namespace, CONFIG.targetDeck)).toBe(true);
});

it('rechaza una actualización de éxito sin ningún cambio y una confirmación sin campos', async () => {
  const noteId = await convertThenEdit();
  const before = getError(db, 1)!;
  fake.override = ({ action }) => action === 'updateNoteFields' ? { result: null, error: null } : undefined;
  await expect(updateAnkiNote(db, 1, fake.transport, CONFIG)).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
  fake.override = ({ action }) => {
    if (action !== 'updateNoteFields') return undefined;
    fake.notes.set(noteId, { ...fake.notes.get(noteId)!, fields: {} });
    return { result: null, error: null };
  };
  await expect(updateAnkiNote(db, 1, fake.transport, CONFIG)).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
  expect(getError(db, 1)).toEqual(before);
});

it('no actualiza si la escritura falla ni si la nota ya no es de este error', async () => {
  const noteId = await convertThenEdit();
  const namespace = ensureAnkiScope(db, CONFIG, 'Juan').namespace;
  fake.failAction = 'updateNoteFields';
  await expect(updateAnkiNote(db, 1, fake.transport, CONFIG)).rejects.toThrow('Fallo simulado');
  expect(ankiContentStale(getError(db, 1)!, namespace, CONFIG.targetDeck)).toBe(true);

  fake.failAction = null;
  const stolen = fake.notes.get(noteId)!;
  fake.notes.set(noteId, { ...stolen, fields: { ...stolen.fields, ErrorLogId: { value: 'errorlog::otra::9', order: 0 } } });
  await expect(updateAnkiNote(db, 1, fake.transport, CONFIG)).rejects.toThrow('ya no corresponde');
});

it('deshacer olvida la huella: no se avisa de una tarjeta que ya no se reclama', async () => {
  await convertThenEdit();
  unmarkAnkiAdded(db, 1);
  expect(getError(db, 1)).toMatchObject({ ankiNoteId: null, ankiContentHash: null });
  expect(ankiContentStale(getError(db, 1)!, ensureAnkiScope(db, CONFIG, 'Juan').namespace, CONFIG.targetDeck)).toBe(false);
});

it('no vincula una nota anterior al error: los ids se reutilizan al restaurar', async () => {
  const noteId = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);

  // Restaurar una copia anterior devuelve el contador de ids atrás: el error 1 de ahora
  // es otro error, creado después de aquella nota, pero con la misma identidad.
  db.update(errorRow).set({
    createdAt: new Date(noteId + 86_400_000).toISOString(),
    prompt: 'un error completamente distinto',
    ankiNoteId: null, ankiAdded: false, ankiAddedAt: null, ankiContentHash: null,
  }).where(eq(errorRow.id, 1)).run();

  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('restaurado');
  // Ni vincula ni escribe: la tarjeta del otro error se queda intacta.
  expect(getError(db, 1)).toMatchObject({ ankiNoteId: null, ankiAdded: false });
  expect(fake.notes.get(noteId)?.fields['Prompt']?.value).toBe('I ___ it');
  expect(fake.added).toBe(1);
});

it('distingue el desfase de una restauración del ruido de reloj', () => {
  const created = '2026-09-22T12:00:00.000Z';
  const at = Date.parse(created);
  expect(notePredatesError(at + 1000, created)).toBe(false);
  expect(notePredatesError(at - 60_000, created)).toBe(false);
  expect(notePredatesError(at - 86_400_000, created)).toBe(true);
  expect(notePredatesError(at, 'fecha rara')).toBe(false);
});

it('trocea la lectura con el tamaño de lote configurado', async () => {
  fake.cards = Array.from({ length: 7 }, (_, i) => card({ cardId: 10 + i, note: 20 }));
  fake.reviews = {};
  await syncAnki(db, fake.transport, NOW, { ...CONFIG, batchSize: 3 });
  const lotes = fake.calls.filter((call) => call.action === 'multi')
    .map((call) => ((call.params['actions'] as { params: { cards: number[] } }[])[0]!).params.cards.length);
  expect(lotes).toEqual([3, 3, 1]);
  expect(loadAnkiDataset(db).cards).toHaveLength(7);
});

it('se rinde con explicación si la lectura entera se pasa de tiempo, sin guardar nada', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const before = loadAnkiDataset(db);
  fake.cards = [card(), card({ cardId: 11, note: 20 })];

  // El tiempo en cola también cuenta: al conseguir el bloqueo ya no queda presupuesto.
  let clock = Date.now();
  const spy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 60_000));
  try {
    const failed = syncAnki(db, fake.transport, NOW, { ...CONFIG, batchSize: 1, syncBudgetMs: 30_000 });
    await expect(failed).rejects.toMatchObject({ code: 'ANKI_LENTO' });
    await expect(failed).rejects.toThrow('ANKI_SYNC_BUDGET_MS');
  } finally { spy.mockRestore(); }

  // El corte ocurre antes de escribir: el espejo se queda como estaba.
  expect(loadAnkiDataset(db)).toEqual(before);
});

it.each([
  ['version', 1], ['getActiveProfile', 1], ['deckNames', 1], ['getPreferences', 1],
  ['findCards', 1], ['multi', 1], ['notesInfo', 1], ['getActiveProfile', 2],
] as const)('el presupuesto cancela una espera en %s (llamada %s) y nunca guarda al llegar tarde', async (action, occurrence) => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const before = loadAnkiDataset(db);
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  const stalled = new Promise<unknown>((resolve) => { release = resolve; });
  let seen = 0;
  let signal: AbortSignal | undefined;
  const transport: Transport = async (request, cancellation) => {
    if (request.action === action && ++seen === occurrence) {
      signal = cancellation;
      // Este doble ignora la cancelación a propósito para comprobar respuestas tardías.
      return stalled;
    }
    return fake.transport(request);
  };
  try {
    const failed = expect(syncAnki(db, transport, NOW, { ...CONFIG, syncBudgetMs: 100 }))
      .rejects.toMatchObject({ code: 'ANKI_LENTO' });
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(signal?.aborted).toBe(true);
    release({ result: null, error: 'unsupported action' });
    await withAnkiLock(db, async () => undefined);
    expect(loadAnkiDataset(db)).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it('suma las llamadas iniciales y comprueba el plazo al volver de cada await', async () => {
  let clock = Date.now();
  const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
  const calls: string[] = [];
  try {
    await expect(syncAnki(db, async (request) => {
      calls.push(request.action);
      const result = await fake.transport(request);
      clock += 25;
      return result;
    }, NOW, { ...CONFIG, syncBudgetMs: 100 })).rejects.toMatchObject({ code: 'ANKI_LENTO' });
    expect(calls).toEqual(['version', 'getActiveProfile', 'deckNames', 'getPreferences']);
    expect(loadAnkiDataset(db).sync).toBeNull();
  } finally { spy.mockRestore(); }
});

it('aborta el HTTP en vuelo y libera el bloqueo al agotar el presupuesto', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const request = JSON.parse(String(options?.body)) as Parameters<Transport>[0];
    if (request.action !== 'findCards') return Response.json(await fake.transport(request));
    signal = options?.signal ?? undefined;
    return new Promise<Response>((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const failed = expect(syncAnki(db, undefined, NOW, { ...CONFIG, syncBudgetMs: 100 }))
      .rejects.toMatchObject({ code: 'ANKI_LENTO' });
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(signal?.aborted).toBe(true);
    await withAnkiLock(db, async () => undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(loadAnkiDataset(db).sync).toBeNull();
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});

it('incluye las esperas de reintento en el presupuesto y no vuelve a enviar tras expirar', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('lento', 'TimeoutError'));
  vi.stubGlobal('fetch', fetcher);
  try {
    const failed = expect(syncAnki(db, undefined, NOW, { ...CONFIG, syncBudgetMs: 100 }))
      .rejects.toMatchObject({ code: 'ANKI_LENTO' });
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    await vi.advanceTimersByTimeAsync(2000);
    await withAnkiLock(db, async () => undefined);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadAnkiDataset(db).sync).toBeNull();
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});

it.each([0, -1, 1.5, NaN, Infinity])('batches rechaza un tamaño inválido incluso sin valores: %s', (size) => {
  expect(() => batches([], size)).toThrow('entero positivo');
  expect(() => batches([1], size)).toThrow(RangeError);
});

it('los errores de red y snapshots incompletos no cambian nada en SQLite', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const before = loadAnkiDataset(db);
  fake.disconnected = true;
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CERRADO' });
  fake.disconnected = false;
  fake.notes.delete(20);
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toThrow('Falta la nota');
  expect(loadAnkiDataset(db)).toEqual(before);
});
it('impide mezclar perfiles, endpoints y mazos', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const before = loadAnkiDataset(db);
  for (const changed of [{ ...CONFIG, sourceDeck: 'Otro' }, { ...CONFIG, targetDeck: 'Otro' }, { ...CONFIG, url: 'http://localhost:8765/' }]) {
    await expect(syncAnki(db, fake.transport, NOW, changed)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  }
  fake.profile = 'Otro';
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
  expect(loadAnkiDataset(db)).toEqual(before);
});
it('comprueba el mazo y que el perfil no cambió durante la lectura', async () => {
  fake.decks = [];
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toThrow('No se encuentra');
  fake.decks = [CONFIG.sourceDeck];
  let profiles = 0;
  fake.override = ({ action }) => action === 'getActiveProfile' ? { result: ++profiles === 1 ? 'Juan' : 'Otro', error: null } : undefined;
  await expect(syncAnki(db, fake.transport, NOW, CONFIG)).rejects.toThrow('perfil cambió');
  expect(loadAnkiDataset(db).sync).toBeNull();
});
it('muestra estado útil con Anki abierto y cerrado', async () => {
  const t0 = Date.now();
  expect(await ankiStatus(db, CONFIG, fake.transport, t0)).toMatchObject({ available: true });
  fake.disconnected = true;
  expect(await ankiStatus(db, CONFIG, fake.transport, t0 + 10_000)).toMatchObject({ available: false, message: expect.stringContaining('Abre Anki') });
});

it('no vuelve a preguntar a Anki en cada render, pero no tapa un cambio real', async () => {
  const t0 = Date.now();
  await ankiStatus(db, CONFIG, fake.transport, t0);
  const versions = () => fake.calls.filter((call) => call.action === 'version').length;
  const asked = versions();

  // Dentro de la ventana se reutiliza el saludo, pero se verifica el perfil.
  await ankiStatus(db, CONFIG, fake.transport, t0 + 1000);
  expect(versions()).toBe(asked);
  expect(fake.calls.at(-1)?.action).toBe('getActiveProfile');

  // Pasada la ventana, sí.
  await ankiStatus(db, CONFIG, fake.transport, t0 + 6000);
  expect(versions()).toBeGreaterThan(asked);
});

it.each([{ sourceDeck: 'Otro' }, { targetDeck: 'Otro' }, { url: 'http://localhost:8766/' }])(
  'invalida el estado cuando cambia el alcance dentro del TTL: %j', async (changed) => {
    await syncAnki(db, fake.transport, NOW, CONFIG);
    const t0 = Date.now();
    expect(await ankiStatus(db, CONFIG, fake.transport, t0)).toMatchObject({ available: true });
    expect(await ankiStatus(db, { ...CONFIG, ...changed }, fake.transport, t0 + 1))
      .toMatchObject({ available: false });
  });

it('no oculta un cambio de perfil, clave o desactivación durante el TTL', async () => {
  await syncAnki(db, fake.transport, NOW, CONFIG);
  const t0 = Date.now();
  await ankiStatus(db, CONFIG, fake.transport, t0);
  fake.profile = 'Otro';
  expect(await ankiStatus(db, CONFIG, fake.transport, t0 + 1)).toMatchObject({ available: false });
  fake.profile = 'Juan';
  await ankiStatus(db, CONFIG, fake.transport, t0 + 2);
  const calls = fake.calls.length;
  await ankiStatus(db, { ...CONFIG, apiKey: 'nueva' }, fake.transport, t0 + 3);
  expect(fake.calls.slice(calls).map((call) => call.action)).toEqual(['version', 'getActiveProfile']);
  expect(await ankiStatus(db, { ...CONFIG, disabled: true }, undefined, t0 + 4)).toMatchObject({ available: false });
});

it('hablar con Anki invalida el estado guardado: abrirlo se nota al momento', async () => {
  const t0 = Date.now();
  fake.disconnected = true;
  expect(await ankiStatus(db, CONFIG, fake.transport, t0)).toMatchObject({ available: false });

  // Se abre Anki y se pulsa Sincronizar: el aviso no puede seguir diciendo que está cerrado.
  fake.disconnected = false;
  await syncAnki(db, fake.transport, NOW, CONFIG);
  expect(await ankiStatus(db, CONFIG, fake.transport, t0 + 1000)).toMatchObject({ available: true });
});
it('revierte todo el snapshot si falla un CHECK al escribir', () => {
  const initial = ankiFixture();
  const broken = { ...initial, noteIdentities: new Map(), reviews: [{ ...initial.reviews[0]!, ease: 0 }], missingNoteIds: [], newReviews: 1, rollover: ROLLOVER };
  expect(() => saveAnkiSnapshot(db, broken, CONFIG, 'Juan', NOW.toISOString())).toThrow();
  expect(loadAnkiDataset(db)).toEqual({ notes: [], cards: [], reviews: [], sync: null });
});
it('aplica SET NULL al vínculo y cascada al espejo, sin borrar el error', () => {
  const data = ankiFixture();
  saveAnkiSnapshot(db, { ...data, noteIdentities: new Map(), missingNoteIds: [], newReviews: 1, rollover: ROLLOVER }, CONFIG, 'Juan', NOW.toISOString());
  linkAnkiNote(db, 1, data.notes[0]!, NOW.toISOString(), 'huella');
  db.delete(ankiNote).where(eq(ankiNote.noteId, 20)).run();
  expect(getError(db, 1)?.ankiNoteId).toBeNull();
  expect(loadAnkiDataset(db).cards).toEqual([]);
  expect(db.select().from(ankiReview).all()).toEqual([]);
});
it('revierte SQLite si la escritura del espejo agota el presupuesto', () => {
  const data = ankiFixture();
  let checks = 0;
  expect(() => saveAnkiSnapshot(db, { ...data, noteIdentities: new Map(), missingNoteIds: [], newReviews: 1, rollover: ROLLOVER },
    CONFIG, 'Juan', NOW.toISOString(), () => {
      if (++checks === 2) throw new AnkiError('ANKI_LENTO', 'presupuesto agotado');
    })).toThrow('presupuesto agotado');
  expect(loadAnkiDataset(db)).toEqual({ notes: [], cards: [], reviews: [], sync: null });
});
it('serializa operaciones, incluso si falla la anterior', async () => {
  const order: number[] = [];
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const first = withAnkiLock(db, async () => { order.push(1); await blocker; throw new Error('fallo'); });
  const second = withAnkiLock(db, async () => { order.push(2); });
  await Promise.resolve(); await Promise.resolve();
  expect(order).toEqual([1]);
  release();
  await expect(first).rejects.toThrow('fallo');
  await second;
  expect(order).toEqual([1, 2]);
});

it('crea una nota propia verificada y su vínculo, sin alterar el modelo de 18 campos', async () => {
  const nid = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  expect(getError(db, 1)).toMatchObject({ ankiAdded: true, ankiNoteId: nid, ankiAddedAt: NOW.toISOString() });
  expect(fake.calls.find((call) => call.action === 'createModel')?.params).toMatchObject({ modelName: 'Error Log C1', isCloze: false });
  expect(loadAnkiDataset(db).notes[0]?.category).toBe('COLOCACION');
});
it('un timeout después de crear se recupera sin duplicados; deshacer conserva la nota', async () => {
  fake.afterAddFails = true;
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow();
  expect(getError(db, 1)?.ankiAdded).toBe(false);
  expect(fake.added).toBe(1);
  const nid = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  unmarkAnkiAdded(db, 1);
  expect(getError(db, 1)?.ankiNoteId).toBeNull();
  expect(await createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).toBe(nid);
  expect(fake.added).toBe(1);
});
it('dos solicitudes concurrentes producen una sola nota', async () => {
  const ids = await Promise.all([createAnkiNote(db, 1, fake.transport, NOW, CONFIG), createAnkiNote(db, 1, fake.transport, NOW, CONFIG)]);
  expect(ids[0]).toBe(ids[1]); expect(fake.added).toBe(1);
});
it('rechaza causas que no generan tarjeta, errores borrados y modelos incompatibles', async () => {
  await expect(createAnkiNote(db, 99, fake.transport, NOW, CONFIG)).rejects.toThrow('no existe');
  db.update(errorRow).set({ cause: 'DESPISTE' }).run();
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('no genera');
  db.update(errorRow).set({ cause: 'CONFUSION' }).run();
  fake.models = ['Error Log C1']; fake.fields = ['Foreign'];
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('otros campos');
  expect(fake.added).toBe(0);
});
it('escapa HTML, saltos y comillas de los campos enviados a Anki', () => {
  expect(escapeAnkiHtml('<script>&"\'\n')).toBe('&lt;script&gt;&amp;&quot;&#39;<br>');
});
it('no marca una nota sin tarjeta, de identidad errónea o no verificable', async () => {
  fake.override = ({ action }) => action === 'notesInfo' ? { result: [{}], error: null } : undefined;
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('verificar');
  expect(getError(db, 1)?.ankiAdded).toBe(false);
});
it('impide vincular coincidencias ambiguas y cambios de perfil durante la creación', async () => {
  fake.override = ({ action }) => action === 'findNotes' ? { result: [20, 21], error: null } : undefined;
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('varias notas');
  let profiles = 0;
  fake.override = ({ action }) => action === 'getActiveProfile' ? { result: ++profiles === 1 ? 'Juan' : 'Otro', error: null } : undefined;
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('perfil cambió');
  expect(fake.added).toBe(0);
});
it('un cambio de perfil al verificar deja la nota recuperable pero no elimina deuda', async () => {
  fake.override = ({ action }) => action === 'getActiveProfile' ? { result: fake.added === 0 ? 'Juan' : 'Otro', error: null } : undefined;
  await expect(createAnkiNote(db, 1, fake.transport, NOW, CONFIG)).rejects.toThrow('perfil cambió');
  expect(fake.added).toBe(1);
  expect(getError(db, 1)?.ankiAdded).toBe(false);
});
it('desmarcar desde Registrar limpia el vínculo; borrar un error conserva la nota de Anki', async () => {
  const nid = await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  const original = getError(db, 1)!;
  updateError(db, 1, { ...original, ankiAdded: false, ankiAddedAt: null });
  expect(getError(db, 1)?.ankiNoteId).toBeNull();
  deleteError(db, 1);
  expect(fake.notes.has(nid)).toBe(true);
});
it('la identidad persistente sobrevive a ensureAnkiScope y la ausencia de respuesta personal', () => {
  const first = ensureAnkiScope(db, CONFIG, 'Juan');
  expect(ensureAnkiScope(db, CONFIG, 'Juan')).toEqual(first);
});
it('una nota nueva sin respuesta del usuario se crea y varios lotes se leen completos', async () => {
  db.update(errorRow).set({ myAnswer: null }).run();
  await createAnkiNote(db, 1, fake.transport, NOW, CONFIG);
  fake.cards = Array.from({ length: 251 }, (_, i) => card({ cardId: 1000 + i, note: 2000 + i }));
  fake.notes = new Map(fake.cards.map((value) => [value.note, note({ noteId: value.note, cards: [value.cardId] })]));
  expect((await syncAnki(db, fake.transport, NOW, CONFIG)).cards).toBe(251);
});
