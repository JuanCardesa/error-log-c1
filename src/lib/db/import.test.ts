import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { errorInputSchema, sessionInputSchema } from '../validation/schemas';
import { createDb, type Db } from './client';
import { MIGRATIONS_DIR } from './paths';
import { createSession, importErrors, listErrors, setSessionStatus } from './repo';

let db: Db;
let sessionId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  sessionId = createSession(db, sessionInputSchema({ today: '2026-09-15' }).parse({
    date: '2026-09-15', paper: 'RUOE', part: 1, kind: 'DRILL', source: 'LIBRO', itemsTotal: 8, itemsCorrect: 6,
  })).id;
});
afterEach(() => { db.$client.close(); });

const input = (id: number, itemRef: string) => errorInputSchema().parse({
  sessionId: id, itemRef, prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'PHRASAL_VERB', cause: 'CONFUSION', confidence: 'DUDABA',
  ruleNote: 'Call off significa cancelar una actividad.', lateInSession: true,
});

it('guarda la tanda sin duplicados internos ni al repetir el envio', () => {
  const row = input(sessionId, '4');
  expect(importErrors(db, sessionId, [row, row, input(sessionId, '5')])).toEqual({ ok: true, created: 2, skipped: 1 });
  expect(importErrors(db, sessionId, [row])).toEqual({ ok: true, created: 0, skipped: 1 });
  expect(listErrors(db, sessionId)).toHaveLength(2);
  expect(listErrors(db, sessionId).every((error) => !error.lateInSession)).toBe(true);
});

it('no cambia errores anteriores al pegar otra regla para el mismo error', () => {
  const row = input(sessionId, '4');
  importErrors(db, sessionId, [row]);
  importErrors(db, sessionId, [{ ...row, ruleNote: 'Una explicacion distinta que no debe sobrescribir.' }]);
  expect(listErrors(db, sessionId)[0]?.ruleNote).toBe(row.ruleNote);
});

it('rechaza sesiones cerradas y mantiene toda la tanda sin guardar', () => {
  setSessionStatus(db, sessionId, 'CLOSED');
  expect(importErrors(db, sessionId, [input(sessionId, '4')]).ok).toBe(false);
  expect(importErrors(db, 9999, [input(9999, '4')]).ok).toBe(false);
  expect(listErrors(db, sessionId)).toHaveLength(0);
});

it('revierte tambien la primera fila si falla la segunda escritura', () => {
  const row = input(sessionId, '4');
  expect(() => importErrors(db, sessionId, [row, { ...input(sessionId, '5'), ruleNote: 'corta' }])).toThrow();
  expect(listErrors(db, sessionId)).toHaveLength(0);
});
