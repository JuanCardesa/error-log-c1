import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { countSessions, getSession, listErrors } from './repo';
import { importSessionWithErrors } from './sessionImport';
import { errorsForRow, MAX_SESSION_IMPORT_ROWS } from '../import/errors';

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
  expect(result.message).toBe('Sesión creada con 1 error. 1 repetido omitido.');
});

it.each([3.5, -1, 'abc', NaN, undefined])('rechaza durationMin inválido (%s) sin escribir', (durationMin) => {
  const result = importSessionWithErrors(db, { session, errors: [row] }, { ...options, durationMin });
  expect(result.fieldErrors['session.durationMin']).toEqual(['Los minutos deben ser un entero no negativo o quedar vacíos.']);
  expect(result.ok).toBe(false);
  expect(countSessions(db)).toBe(0);
});

it.each([0, 1, 2])('forma el mensaje para %i errores guardados', (count) => {
  const errors = Array.from({ length: count }, (_, i) => ({ ...row, itemRef: String(i) }));
  expect(importSessionWithErrors(db, { session, errors }, options).message)
    .toBe(`Sesión creada con ${count} ${count === 1 ? 'error' : 'errores'}.`);
});

it('señala el límite de filas en español sin culpar a la cabecera ni escribir', () => {
  const result = importSessionWithErrors(db, { session, errors: Array.from({ length: MAX_SESSION_IMPORT_ROWS + 1 }, () => row) }, options);
  expect(result.ok).toBe(false);
  expect(result.message).toContain(`como máximo ${MAX_SESSION_IMPORT_ROWS} errores`);
  expect(result.message).not.toContain('Revisa la cabecera');
  expect(result.fieldErrors.errors).toHaveLength(1);
  expect(countSessions(db)).toBe(0);
});

it('los errores estructurales y de negocio llegan al campo de la misma fila', () => {
  const structural = importSessionWithErrors(db, { session, errors: [row, { ...row, prompt: 123 }] }, options);
  const business = importSessionWithErrors(db, { session, errors: [row, { ...row, prompt: '' }] }, options);
  expect(structural.fieldErrors['errors.1.prompt']?.[0]).toContain('se esperaba texto');
  expect(structural.message).not.toContain('Revisa la cabecera');
  expect(business.fieldErrors['1.prompt']).toHaveLength(1);
  for (const result of [structural, business]) {
    expect(errorsForRow(result.fieldErrors, 1).prompt).toHaveLength(1);
    expect(errorsForRow(result.fieldErrors, 0)).toEqual({});
    expect(result.ok).toBe(false);
  }
  expect(countSessions(db)).toBe(0);
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

it('revierte una tanda larga a mitad de escritura y deja la conexión utilizable', () => {
  const errors = Array.from({ length: MAX_SESSION_IMPORT_ROWS }, (_, i) => ({ ...row, itemRef: String(i) }));
  db.$client.exec("CREATE TRIGGER fail_late BEFORE INSERT ON error_row WHEN NEW.item_ref = '200' BEGIN SELECT RAISE(ABORT, 'fallo tardio'); END");
  expect(() => importSessionWithErrors(db, { session, errors }, options)).toThrow('fallo tardio');
  expect(countSessions(db)).toBe(0);
  expect(db.$client.prepare('select count(*) as n from error_row').get()).toEqual({ n: 0 });
  expect(db.$client.inTransaction).toBe(false);
  // La misma conexión sigue sirviendo: el rollback no la deja a medias.
  db.$client.exec('DROP TRIGGER fail_late');
  const retry = importSessionWithErrors(db, { session, errors }, options);
  expect(retry.ok).toBe(true);
  expect(listErrors(db, retry.createdId!)).toHaveLength(MAX_SESSION_IMPORT_ROWS);
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
