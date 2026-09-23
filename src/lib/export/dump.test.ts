import { beforeEach, describe, expect, it } from 'vitest';

import type { QueryOptions } from '../domain/types';
import {
  NOW,
  daysAgo,
  makeDataset,
  makeError,
  makeErrors,
  makePiece,
  makeSession,
  resetIds,
} from '../queries/fixtures/build';
import { CSV_EXPORTS, isCsvExport, toCsvExport, toJsonDump } from './dump';

const opts: QueryOptions = { now: NOW, windowDays: 30 };

it('exporta los nulos de practica libre sin inventar paper ni part', () => {
  const free = makeSession({ paper: null, part: null });
  const dump = toJsonDump(makeDataset({ sessions: [free] }), NOW);
  expect(JSON.stringify(dump.rows.sessions)).toContain('"paper":null,"part":null');
  // El CSV de RUOE tampoco inventa una fila para una sesion sin paper.
  expect(toCsvExport('q3', makeDataset({ sessions: [free] }), opts).trim().split('\r\n')).toHaveLength(1);
});

function sample() {
  return makeDataset({
    sessions: [
      makeSession({ id: 1, date: daysAgo(3), itemsTotal: 20, itemsCorrect: 16, timed: true }),
      makeSession({
        id: 2,
        kind: 'WRITING',
        paper: 'WRITING',
        part: 1,
        date: daysAgo(2),
        itemsTotal: null,
        itemsCorrect: null,
      }),
    ],
    errors: [
      ...makeErrors(3, { sessionId: 1, cause: 'DESPISTE', category: 'SPELLING' }),
      makeError({ sessionId: 1, cause: 'CONFUSION', confidence: 'SEGURO' }),
      makeError({ sessionId: 2, category: 'REGISTRO' }),
    ],
    pieces: [makePiece({ id: 100, sessionId: 2 })],
  });
}

beforeEach(() => {
  resetIds();
});

describe('exportacion a CSV', () => {
  it('reconoce las siete queries', () => {
    expect([...CSV_EXPORTS]).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
    expect(isCsvExport('q1')).toBe(true);
    expect(isCsvExport('q7')).toBe(true);
    expect(isCsvExport('q8')).toBe(false);
    expect(isCsvExport('../secreto')).toBe(false);
  });

  it('cada query produce un CSV con cabecera', () => {
    const data = sample();
    for (const which of CSV_EXPORTS) {
      const csv = toCsvExport(which, data, opts);
      expect(csv.endsWith('\r\n'), `${which} termina en CRLF`).toBe(true);
      expect(csv.split('\r\n')[0]?.length, `${which} tiene cabecera`).toBeGreaterThan(0);
    }
  });

  it('Q1 sale con las seis causas', () => {
    const csv = toCsvExport('q1', sample(), opts);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(7);
  });

  it('Q4 exporta 30 dias fijos aunque se pida una ventana de 60', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, date: daysAgo(45) })],
      errors: [makeError({ sessionId: 1, confidence: 'SEGURO' })],
    });
    const csv = toCsvExport('q4', data, { now: NOW, windowDays: 60 });
    // Solo la cabecera: la sesion cae fuera de los 30 dias.
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('volcado JSON', () => {
  it('lleva las filas crudas y nada recalculable', () => {
    const dump = toJsonDump(sample(), NOW);

    expect(dump.rows.sessions).toHaveLength(2);
    expect(dump.rows.errors).toHaveLength(5);
    expect(dump.rows.pieces).toHaveLength(1);
    // Las agregaciones se recalculan desde las filas: duplicarlas solo daba dos versiones
    // del mismo dato, una de ellas con fecha de caducidad.
    expect(Object.keys(dump)).toEqual(['exportedAt', 'rows', 'anki']);
  });

  it('sella la fecha de exportacion y no depende de la ventana', () => {
    const dump = toJsonDump(sample(), NOW);
    expect(dump.exportedAt).toBe(NOW.toISOString());
  });

  it('es serializable sin perder nada', () => {
    const dump = toJsonDump(sample(), NOW);
    const roundTrip: unknown = JSON.parse(JSON.stringify(dump));
    expect(roundTrip).toEqual(JSON.parse(JSON.stringify(dump)));
  });

  it('funciona sobre una base vacia', () => {
    const dump = toJsonDump(makeDataset(), NOW);
    expect(dump.rows.sessions).toEqual([]);
    expect(dump.anki.reviews).toEqual([]);
  });
});
