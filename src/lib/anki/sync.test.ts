import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';
import { migrate } from '../db/migrate';
import { loadAnkiDataset } from '../db/load';
import { ensureAnkiScope, linkAnkiNote, saveAnkiSnapshot } from '../db/ankiRepo';
import { getError, unmarkAnkiAdded, updateError, deleteError } from '../db/repo';
import { ankiNote, ankiReview, errorRow, session } from '../db/schema';
import { createAnkiNote, escapeAnkiHtml } from './create';
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
  expect(await ankiStatus(db, CONFIG, fake.transport)).toMatchObject({ available: true });
  fake.disconnected = true;
  expect(await ankiStatus(db, CONFIG, fake.transport)).toMatchObject({ available: false, message: expect.stringContaining('Abre Anki') });
});
it('revierte todo el snapshot si falla un CHECK al escribir', () => {
  const initial = ankiFixture();
  const broken = { ...initial, reviews: [{ ...initial.reviews[0]!, ease: 0 }], missingNoteIds: [], newReviews: 1, rollover: ROLLOVER };
  expect(() => saveAnkiSnapshot(db, broken, CONFIG, 'Juan', NOW.toISOString())).toThrow();
  expect(loadAnkiDataset(db)).toEqual({ notes: [], cards: [], reviews: [], sync: null });
});
it('aplica SET NULL al vínculo y cascada al espejo, sin borrar el error', () => {
  const data = ankiFixture();
  saveAnkiSnapshot(db, { ...data, missingNoteIds: [], newReviews: 1, rollover: ROLLOVER }, CONFIG, 'Juan', NOW.toISOString());
  linkAnkiNote(db, 1, data.notes[0]!, NOW.toISOString());
  db.delete(ankiNote).where(eq(ankiNote.noteId, 20)).run();
  expect(getError(db, 1)?.ankiNoteId).toBeNull();
  expect(loadAnkiDataset(db).cards).toEqual([]);
  expect(db.select().from(ankiReview).all()).toEqual([]);
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
  let profiles = 0;
  fake.override = ({ action }) => action === 'getActiveProfile' ? { result: ++profiles < 3 ? 'Juan' : 'Otro', error: null } : undefined;
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
