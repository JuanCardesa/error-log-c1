import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { countSessions, getSession, listErrors } from './repo';
import { importSessionWithErrors } from './sessionImport';

let db: Db;
beforeEach(() => { db = createDb(':memory:'); migrate(db, { migrationsFolder: MIGRATIONS_DIR }); });
afterEach(() => db.$client.close());
const options = { today: '2026-09-20', now: '2026-09-20T10:00:00Z', elapsed: 20, durationMin: null };
const session = { date: options.today, kind: 'DRILL', paper: null, part: null, source: 'LIBRO',
  sourceRef: 'Libro · págs. 6-7', itemsTotal: 8, itemsCorrect: 6, timed: false };
const row = { itemRef: '1', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };

it('crea una sesión OPEN y sus errores, con duración solo si se escribe aparte', () => {
  const result = importSessionWithErrors(db, { session, errors: [row, row] }, { ...options, durationMin: 15 });
  expect(result.ok).toBe(true);
  expect(countSessions(db)).toBe(1);
  expect(getSession(db, result.createdId!)).toMatchObject({ ...session, durationMin: 15, status: 'OPEN' });
  expect(listErrors(db, result.createdId!)).toHaveLength(1);
});

it.each([
  { ...row, correctAnswer: '' }, { ...row, category: '' }, { ...row, ruleNote: 'corta' },
  { ...row, cause: 'DESPISTE', ankiAdded: true },
])('un error inválido impide crear la cabecera y todas las filas', (invalid) => {
  const result = importSessionWithErrors(db, { session, errors: [row, invalid] }, options);
  expect(result.ok).toBe(false);
  expect(result.message).toContain('No se ha creado ninguna sesión');
  expect(countSessions(db)).toBe(0);
  expect(db.$client.prepare('select count(*) as n from error_row').get()).toEqual({ n: 0 });
});

it('revierte la cabecera y la primera fila si SQLite falla en la segunda escritura', () => {
  db.$client.exec("CREATE TRIGGER fail_second BEFORE INSERT ON error_row WHEN NEW.item_ref = '2' BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END");
  expect(() => importSessionWithErrors(db, { session, errors: [row, { ...row, itemRef: '2' }] }, options)).toThrow('fallo simulado');
  expect(countSessions(db)).toBe(0);
  expect(db.$client.prepare('select count(*) as n from error_row').get()).toEqual({ n: 0 });
});

it.each(['id', 'status', 'durationMin', 'page', 'exercise'])('el servidor rechaza %s en la cabecera pegada', (field) => {
  const result = importSessionWithErrors(db, { session: { ...session, [field]: 123 }, errors: [row] }, options);
  expect(result.ok).toBe(false);
  expect(result.message).toContain(field);
  expect(countSessions(db)).toBe(0);
});

it('registra una tanda sin fallos para conservar el denominador', () => {
  const result = importSessionWithErrors(db, { session: { ...session, itemsCorrect: 8 }, errors: [] }, options);
  expect(result.ok).toBe(true);
  expect(getSession(db, result.createdId!)?.itemsTotal).toBe(8);
  expect(listErrors(db, result.createdId!)).toHaveLength(0);
});
