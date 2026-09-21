import { migrate } from '@/lib/db/migrate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Db, createDb, getDb } from '@/lib/db/client';
import type * as DbClient from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { MIGRATIONS_DIR } from '@/lib/db/paths';
import { deleteError, deleteSession, deleteWritingPiece, getError, getSession, listErrors, listWritingPieces, markAnkiAdded } from '@/lib/db/repo';
import { seed } from '@/lib/db/seed';
import { createSessionAction, updateErrorAction, updateSessionAction } from './registrar/actions';
import { EMPTY_STATE } from './registrar/formState';
import { importErrorsAction } from './registrar/importActions';
import { MAX_IMPORT_ROWS, MAX_SESSION_IMPORT_ROWS } from '@/lib/import/errors';
import { saveWritingPieceAction } from './writing/actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/client', async (importOriginal) => {
  const original = await importOriginal<typeof DbClient>();
  return { ...original, getDb: vi.fn() };
});

let db: Db;
beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  seed(db, new Date('2020-01-20T12:00:00Z'));
  vi.mocked(getDb).mockReturnValue(db);
});
afterEach(() => db.$client.close());

function form(values: object): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== false) result.set(key, value === null ? '' : String(value));
  }
  return result;
}

describe('importar en una sesión abierta', () => {
  const header = { date: '2020-01-20', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', itemsTotal: 10, itemsCorrect: 8 };
  const row = { prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
    category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };

  it.each([{ ...header, date: '2999-01-01' }, { status: 'INVALID' }, null, undefined])('ignora una cabecera que no va a escribir (%j)', async (session) => {
    const created = await createSessionAction(EMPTY_STATE, form(header));
    const id = created.createdId!;
    const before = getSession(db, id);
    const result = await importErrorsAction(EMPTY_STATE, form({ sessionId: id, envelope: JSON.stringify({ session, errors: [row] }) }));
    expect(result.ok).toBe(true);
    expect(result.message).toBe('1 error guardado.');
    expect(getSession(db, id)).toEqual(before);
    expect(listErrors(db, id)).toHaveLength(1);
  });

  it('concuerda el recuento de repetidos omitidos con su verbo', async () => {
    const created = await createSessionAction(EMPTY_STATE, form(header));
    const id = created.createdId!;
    await importErrorsAction(EMPTY_STATE, form({ sessionId: id, rows: JSON.stringify([row]) }));
    const again = await importErrorsAction(EMPTY_STATE, form({ sessionId: id, rows: JSON.stringify([row]) }));
    expect(again.message).toBe('0 errores guardados. 1 repetido omitido; los existentes se conservan.');
    expect(listErrors(db, id)).toHaveLength(1);
  });

  it.each([['rows', MAX_IMPORT_ROWS], ['envelope', MAX_SESSION_IMPORT_ROWS]] as const)('respeta el límite de %s sin guardar parcialmente', async (field, limit) => {
    const created = await createSessionAction(EMPTY_STATE, form(header));
    const id = created.createdId!;
    const errors = Array.from({ length: limit + 1 }, (_, i) => ({ ...row, itemRef: String(i) }));
    const payload = (rows: typeof errors) => form({ sessionId: id, [field]: JSON.stringify(field === 'envelope' ? { session: null, errors: rows } : rows) });
    const rejected = await importErrorsAction(EMPTY_STATE, payload(errors));
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toContain(`entre 1 y ${limit}`);
    expect(listErrors(db, id)).toHaveLength(0);
    expect((await importErrorsAction(EMPTY_STATE, payload(errors.slice(1)))).ok).toBe(true);
    expect(listErrors(db, id)).toHaveLength(limit);
  });

  it('devuelve un error de tipo junto a la fila y no guarda las demás', async () => {
    const created = await createSessionAction(EMPTY_STATE, form(header));
    const result = await importErrorsAction(EMPTY_STATE, form({ sessionId: created.createdId,
      envelope: JSON.stringify({ session: null, errors: [row, { ...row, prompt: 123 }] }) }));
    expect(result.fieldErrors['1.prompt']?.[0]).toContain('se esperaba texto');
    expect(result.ok).toBe(false);
    expect(listErrors(db, created.createdId!)).toHaveLength(0);
  });
});

describe('sesiones sin formato de examen', () => {
  const free = { date: '2020-01-20', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', itemsTotal: 10, itemsCorrect: 8 };

  it('crea, edita y cambia de formato conservando los nulos', async () => {
    const created = await createSessionAction(EMPTY_STATE, form(free));
    expect(created.ok).toBe(true);
    const row = () => loadDataset(db).sessions.find((value) => value.id === created.createdId);
    expect(row()).toMatchObject({ paper: null, part: null });
    expect((await updateSessionAction(EMPTY_STATE, form({ ...free, id: created.createdId, sourceRef: 'Unidad 2' }))).ok).toBe(true);
    expect(row()).toMatchObject({ paper: null, part: null, sourceRef: 'Unidad 2' });
    expect((await updateSessionAction(EMPTY_STATE, form({ ...free, id: created.createdId, paper: 'LISTENING', part: 4 }))).ok).toBe(true);
    expect(row()).toMatchObject({ paper: 'LISTENING', part: 4 });
    expect((await updateSessionAction(EMPTY_STATE, form({ ...free, id: created.createdId }))).ok).toBe(true);
    expect(row()).toMatchObject({ paper: null, part: null });
  });

  it('rechaza partes residuales y la ausencia del campo paper', async () => {
    const before = loadDataset(db);
    expect((await createSessionAction(EMPTY_STATE, form({ ...free, part: 3 }))).ok).toBe(false);
    const missing = form(free);
    missing.delete('paper');
    expect((await createSessionAction(EMPTY_STATE, missing)).ok).toBe(false);
    expect(loadDataset(db)).toEqual(before);
  });

  it('no permite asociar Writing ni convertir una sesion con texto en practica libre', async () => {
    const created = await createSessionAction(EMPTY_STATE, form(free));
    expect((await saveWritingPieceAction(EMPTY_STATE, form({ sessionId: created.createdId, date: free.date, genre: 'ESSAY' }))).ok).toBe(false);
    const before = loadDataset(db);
    const writing = before.pieces[0];
    if (writing === undefined) throw new Error('Falta Writing en el seed');
    expect((await updateSessionAction(EMPTY_STATE, form({ ...free, id: writing.sessionId }))).fieldErrors['paper']?.[0]).toContain('texto asociado');
    expect(loadDataset(db)).toEqual(before);
  });
});

describe('corregir errores existentes', () => {
  it('conserva la fecha de conversion a Anki al corregir el texto', async () => {
    const original = loadDataset(db).errors.find((row) => row.ankiAdded);
    if (original === undefined) throw new Error('Falta una tarjeta en el seed');
    const changed = { ...original, correctAnswer: 'respuesta corregida' };
    expect((await updateErrorAction(EMPTY_STATE, form(changed))).ok).toBe(true);
    expect(getError(db, original.id)).toEqual(changed);
  });

  it('no cambia la fecha si dos pestañas marcan la misma tarjeta', () => {
    const original = loadDataset(db).errors.find((row) => row.ankiAdded);
    if (original === undefined) throw new Error('Falta una tarjeta en el seed');
    markAnkiAdded(db, original.id, '2026-09-16T15:00:00Z');
    expect(getError(db, original.id)?.ankiAddedAt).toBe(original.ankiAddedAt);
  });

  it('rechaza editar un error borrado en otra pestaña', async () => {
    const original = loadDataset(db).errors[0];
    if (original === undefined) throw new Error('Falta un error en el seed');
    deleteError(db, original.id);
    const result = await updateErrorAction(EMPTY_STATE, form(original));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya no existe');
  });

  it('rechaza mover un error a otra sesion mediante una cabecera desactualizada', async () => {
    const before = loadDataset(db);
    const original = before.errors[0];
    const other = before.sessions.find((row) => row.id !== original?.sessionId);
    if (original === undefined || other === undefined) throw new Error('Faltan datos en el seed');
    const result = await updateErrorAction(EMPTY_STATE, form({ ...original, sessionId: other.id }));
    expect(result.ok).toBe(false);
    expect(loadDataset(db)).toEqual(before);
  });

  it('no confirma la edicion de una sesion que ya no existe', async () => {
    const original = loadDataset(db).sessions[0];
    if (original === undefined) throw new Error('Falta una sesion en el seed');
    deleteSession(db, original.id);
    const result = await updateSessionAction(EMPTY_STATE, form(original));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya no existe');
  });
});

describe('guardar Writing con datos cambiados en otra pestaña', () => {
  it('rechaza una sesion que ya tiene texto sin sobrescribirlo', async () => {
    const before = loadDataset(db);
    const original = before.pieces[0];
    if (original === undefined) throw new Error('Falta Writing en el seed');
    const input = form({ ...original, wordCount: 999 });
    input.delete('id');
    const result = await saveWritingPieceAction(EMPTY_STATE, input);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors['sessionId']?.[0]).toContain('ya tiene un texto');
    expect(loadDataset(db)).toEqual(before);
  });

  it('no dice que ha actualizado un texto borrado', async () => {
    const original = listWritingPieces(db)[0];
    if (original === undefined) throw new Error('Falta Writing en el seed');
    deleteWritingPiece(db, original.id);
    const result = await saveWritingPieceAction(EMPTY_STATE, form(original));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya no existe');
  });

  it('avisa si se ha borrado la sesion seleccionada para un texto nuevo', async () => {
    const original = listWritingPieces(db)[0];
    if (original === undefined) throw new Error('Falta Writing en el seed');
    deleteSession(db, original.sessionId);
    const input = form(original);
    input.delete('id');
    const result = await saveWritingPieceAction(EMPTY_STATE, input);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors['sessionId']?.[0]).toContain('ya no esta disponible');
  });

  it('no convierte una edicion con identificador invalido en una creacion', async () => {
    const original = listWritingPieces(db)[0];
    if (original === undefined) throw new Error('Falta Writing en el seed');
    expect((await saveWritingPieceAction(EMPTY_STATE, form({ ...original, id: 'invalido' }))).ok).toBe(false);
  });

  it('impide convertir una sesion con texto asociado a otro paper', async () => {
    const before = loadDataset(db);
    const original = before.sessions.find((row) => row.paper === 'WRITING');
    if (original === undefined) throw new Error('Falta Writing en el seed');
    const result = await updateSessionAction(EMPTY_STATE, form({ ...original, paper: 'RUOE', kind: 'DRILL', itemsTotal: 8, itemsCorrect: 8 }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors['paper']?.[0]).toContain('texto asociado');
    expect(loadDataset(db)).toEqual(before);
  });
});
