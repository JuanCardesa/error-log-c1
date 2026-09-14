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
} from './fixtures/build';
import { q1CauseSplit, q1ToCsv } from './q1CauseSplit';
import { q2CategoryRate, q2ToCsv } from './q2CategoryRate';
import { q3RuoeAccuracy, q3ToCsv } from './q3RuoeAccuracy';
import { q4FalseCertainties } from './q4FalseCertainties';
import { q5AnkiDebt } from './q5AnkiDebt';
import { q6RewriteEfficacy } from './q6RewriteEfficacy';

const opts: QueryOptions = { now: NOW, windowDays: 30 };

beforeEach(() => {
  resetIds();
});

describe('Q1 · reparto de causas', () => {
  it('cuenta y porcentua sobre el total de la ventana', () => {
    const session = makeSession({ id: 1, date: daysAgo(2) });
    const data = makeDataset({
      sessions: [session],
      errors: [
        makeError({ sessionId: 1, cause: 'DESPISTE' }),
        makeError({ sessionId: 1, cause: 'DESPISTE' }),
        makeError({ sessionId: 1, cause: 'TIEMPO' }),
        makeError({ sessionId: 1, cause: 'DESCONOCIMIENTO' }),
      ],
    });

    const result = q1CauseSplit(data, opts);

    expect(result.total).toBe(4);
    expect(result.rows[0]).toMatchObject({ cause: 'DESPISTE', n: 2, pct: 50 });
    expect(result.bySide).toEqual({ study: 25, exec: 75 });
  });

  it('devuelve las seis causas aunque esten a cero', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [makeError({ sessionId: 1, cause: 'FORMATO' })],
    });

    const result = q1CauseSplit(data, opts);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.filter((row) => row.n === 0)).toHaveLength(5);
  });

  it('excluye los errores de sesiones fuera de la ventana', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: daysAgo(2) }),
        makeSession({ id: 2, date: daysAgo(45) }),
      ],
      errors: [
        makeError({ sessionId: 1, cause: 'DESPISTE' }),
        makeError({ sessionId: 2, cause: 'TIEMPO' }),
      ],
    });

    expect(q1CauseSplit(data, opts).total).toBe(1);
    expect(q1CauseSplit(data, { now: NOW, windowDays: 60 }).total).toBe(2);
  });

  it('con cero errores no divide por cero', () => {
    const data = makeDataset({ sessions: [makeSession({ id: 1 })] });
    const result = q1CauseSplit(data, opts);
    expect(result.total).toBe(0);
    expect(result.rows.every((row) => row.pct === 0)).toBe(true);
    expect(result.bySide).toEqual({ study: 0, exec: 0 });
  });

  it('exporta a CSV con cabecera y una fila por causa', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [makeError({ sessionId: 1, cause: 'DESPISTE' })],
    });
    const csv = q1ToCsv(q1CauseSplit(data, opts));
    expect(csv.split('\r\n')[0]).toBe('causa,lado,n,pct');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(7);
  });
});

describe('Q2 · categorias por tasa', () => {
  it('normaliza por items intentados, no por conteo bruto', () => {
    // COLOCACION: 2 errores. PHRASAL_VERB: 3. Pero 100 items en total.
    const data = makeDataset({
      sessions: [makeSession({ id: 1, itemsTotal: 100, itemsCorrect: 95 })],
      errors: [
        ...makeErrors(2, { sessionId: 1, category: 'COLOCACION' }),
        ...makeErrors(3, { sessionId: 1, category: 'PHRASAL_VERB' }),
      ],
    });

    const result = q2CategoryRate(data, opts);

    expect(result.itemsAttempted).toBe(100);
    expect(result.rows[0]).toEqual({
      category: 'PHRASAL_VERB',
      errors: 3,
      ratePer100: 3,
    });
    expect(result.rows[1]?.ratePer100).toBe(2);
  });

  it('ordena por tasa descendente, no por volumen', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, itemsTotal: 200, itemsCorrect: 190 }),
        makeSession({ id: 2, itemsTotal: 10, itemsCorrect: 7 }),
      ],
      errors: [
        ...makeErrors(6, { sessionId: 1, category: 'LEXICO' }),
        ...makeErrors(3, { sessionId: 2, category: 'DISCURSO' }),
      ],
    });

    const result = q2CategoryRate(data, opts);
    // LEXICO tiene el doble de errores, pero se reparte sobre 210 items igual que DISCURSO.
    expect(result.rows.map((row) => row.category)).toEqual(['LEXICO', 'DISCURSO']);
    expect(result.rows[0]?.ratePer100).toBe(2.86);
    expect(result.rows[1]?.ratePer100).toBe(1.43);
  });

  it('deja fuera del calculo los errores de Writing y los reporta aparte', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, itemsTotal: 50, itemsCorrect: 45 }),
        makeSession({
          id: 2,
          kind: 'WRITING',
          paper: 'WRITING',
          part: 1,
          itemsTotal: null,
          itemsCorrect: null,
        }),
      ],
      errors: [
        makeError({ sessionId: 1, category: 'LEXICO' }),
        makeError({ sessionId: 2, category: 'REGISTRO' }),
      ],
    });

    const result = q2CategoryRate(data, opts);
    expect(result.itemsAttempted).toBe(50);
    expect(result.excludedErrors).toBe(1);
    expect(result.rows.map((row) => row.category)).toEqual(['LEXICO']);
  });

  it('no divide por cero cuando no hay items contabilizados', () => {
    const data = makeDataset({
      sessions: [
        makeSession({
          id: 1,
          kind: 'WRITING',
          paper: 'WRITING',
          part: 1,
          itemsTotal: null,
          itemsCorrect: null,
        }),
      ],
      errors: [makeError({ sessionId: 1 })],
    });

    const result = q2CategoryRate(data, opts);
    expect(result.itemsAttempted).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.excludedErrors).toBe(1);
  });

  it('exporta a CSV', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, itemsTotal: 100, itemsCorrect: 98 })],
      errors: [makeError({ sessionId: 1, category: 'LEXICO' })],
    });
    expect(q2ToCsv(q2CategoryRate(data, opts))).toBe(
      'categoria,errores,errores_por_100_items,items_intentados\r\nLEXICO,1,1,100\r\n',
    );
  });
});

describe('Q3 · precision RUOE por part y semana', () => {
  it('agrega por part y semana ISO y calcula el porcentaje', () => {
    // Lunes y miercoles de la misma semana ISO (W37: 07-09-2026 a 13-09-2026).
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: '2026-09-07', part: 3, itemsTotal: 8, itemsCorrect: 4 }),
        makeSession({ id: 2, date: '2026-09-09', part: 3, itemsTotal: 8, itemsCorrect: 6 }),
      ],
    });

    const result = q3RuoeAccuracy(data, opts);

    expect(result.rows.map((row) => row.part)).toEqual([3]);
    expect(result.weeks).toEqual(['2026-W37']);
    // Se suman los items antes de dividir: 10/16, no la media de 50% y 75%.
    expect(result.rows[0]?.cells[0]).toMatchObject({ correct: 10, total: 16, pct: 62.5 });
  });

  it('descarta sesiones con fecha posterior a hoy', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: '2026-09-16', part: 3, itemsTotal: 8, itemsCorrect: 8 }),
      ],
    });
    expect(q3RuoeAccuracy(data, opts).rows).toEqual([]);
  });

  it('deja vacias las celdas sin datos', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: '2026-09-14', part: 2, itemsTotal: 8, itemsCorrect: 8 }),
        makeSession({ id: 2, date: '2026-09-07', part: 4, itemsTotal: 8, itemsCorrect: 4 }),
      ],
    });

    const result = q3RuoeAccuracy(data, opts);

    expect(result.rows.map((row) => row.part)).toEqual([2, 4]);
    expect(result.weeks).toEqual(['2026-W37', '2026-W38']);
    expect(result.rows[0]?.cells[0]).toBeNull(); // part 2, semana 37
    expect(result.rows[0]?.cells[1]).not.toBeNull();
    expect(result.rows[1]?.cells[0]).not.toBeNull();
    expect(result.rows[1]?.cells[1]).toBeNull(); // part 4, semana 38
  });

  it('ignora los papers que no son RUOE', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, paper: 'LISTENING', part: 2 }),
        makeSession({ id: 2, paper: 'SPEAKING', part: 1 }),
      ],
    });
    expect(q3RuoeAccuracy(data, opts).rows).toEqual([]);
  });

  it('el CSV deja la celda vacia en vez de escribir un cero', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: '2026-09-14', part: 2, itemsTotal: 8, itemsCorrect: 8 }),
        makeSession({ id: 2, date: '2026-09-07', part: 4, itemsTotal: 8, itemsCorrect: 4 }),
      ],
    });
    const csv = q3ToCsv(q3RuoeAccuracy(data, opts));
    expect(csv).toBe('part,2026-W37,2026-W38\r\n2,,100\r\n4,50,\r\n');
  });
});

describe('Q4 · falsas certezas', () => {
  it('lista solo los errores marcados SEGURO', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, date: daysAgo(3) })],
      errors: [
        makeError({ sessionId: 1, confidence: 'SEGURO', correctAnswer: 'whereas' }),
        makeError({ sessionId: 1, confidence: 'DUDABA' }),
        makeError({ sessionId: 1, confidence: 'ADIVINE' }),
      ],
    });

    const rows = q4FalseCertainties(data, { now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.correctAnswer).toBe('whereas');
  });

  it('ordena por fecha descendente', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: daysAgo(10) }),
        makeSession({ id: 2, date: daysAgo(2) }),
      ],
      errors: [
        makeError({ id: 10, sessionId: 1, confidence: 'SEGURO' }),
        makeError({ id: 20, sessionId: 2, confidence: 'SEGURO' }),
      ],
    });

    expect(q4FalseCertainties(data, { now: NOW }).map((row) => row.errorId)).toEqual([
      20, 10,
    ]);
  });

  it('usa 30 dias fijos aunque la ventana global sea de 60 (decision P2)', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, date: daysAgo(45) })],
      errors: [makeError({ sessionId: 1, confidence: 'SEGURO' })],
    });

    // La sesion entra en una ventana de 60 dias, pero Q4 no la mira.
    expect(q4FalseCertainties(data, { now: NOW })).toHaveLength(0);
  });
});

describe('Q5 · deuda de Anki', () => {
  it('cuenta solo las causas que generan tarjeta', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [
        makeError({ sessionId: 1, cause: 'DESCONOCIMIENTO', ankiAdded: true }),
        makeError({ sessionId: 1, cause: 'CONFUSION', ankiAdded: false }),
        makeError({ sessionId: 1, cause: 'ORTOGRAFIA', ankiAdded: true }),
        // Estos tres no deben entrar en el denominador.
        makeError({ sessionId: 1, cause: 'DESPISTE' }),
        makeError({ sessionId: 1, cause: 'FORMATO' }),
        makeError({ sessionId: 1, cause: 'TIEMPO' }),
      ],
    });

    const result = q5AnkiDebt(data, opts);
    expect(result.eligible).toBe(3);
    expect(result.added).toBe(2);
    expect(result.pending).toBe(1);
    expect(result.pctConverted).toBe(66.7);
    expect(result.meetsTarget).toBe(false);
  });

  it('marca el objetivo cumplido justo en el 80%', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [
        ...makeErrors(8, { sessionId: 1, cause: 'CONFUSION', ankiAdded: true }),
        ...makeErrors(2, { sessionId: 1, cause: 'CONFUSION', ankiAdded: false }),
      ],
    });

    const result = q5AnkiDebt(data, opts);
    expect(result.pctConverted).toBe(80);
    expect(result.meetsTarget).toBe(true);
  });

  it('con denominador cero devuelve null, no 0%', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [makeError({ sessionId: 1, cause: 'DESPISTE' })],
    });

    const result = q5AnkiDebt(data, opts);
    expect(result.eligible).toBe(0);
    expect(result.pctConverted).toBeNull();
    expect(result.meetsTarget).toBeNull();
  });

  it('ordena la cola de pendientes de mas antigua a mas reciente', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, date: daysAgo(3) }),
        makeSession({ id: 2, date: daysAgo(12) }),
      ],
      errors: [
        makeError({ id: 10, sessionId: 1, cause: 'CONFUSION' }),
        makeError({ id: 20, sessionId: 2, cause: 'CONFUSION' }),
      ],
    });

    expect(q5AnkiDebt(data, opts).queue.map((row) => row.id)).toEqual([20, 10]);
  });
});

describe('Q6 · eficacia del rewrite', () => {
  function writingPair() {
    return {
      sessions: [
        makeSession({
          id: 1,
          kind: 'WRITING' as const,
          paper: 'WRITING' as const,
          part: 1,
          date: daysAgo(10),
          itemsTotal: null,
          itemsCorrect: null,
        }),
        makeSession({
          id: 2,
          kind: 'WRITING' as const,
          paper: 'WRITING' as const,
          part: 1,
          date: daysAgo(3),
          itemsTotal: null,
          itemsCorrect: null,
        }),
      ],
      pieces: [
        makePiece({ id: 100, sessionId: 1, rewriteOf: null }),
        makePiece({ id: 101, sessionId: 2, rewriteOf: 100 }),
      ],
    };
  }

  it('cuenta los errores del original que reaparecen en la reescritura', () => {
    const base = writingPair();
    const data = makeDataset({
      ...base,
      errors: [
        makeError({ sessionId: 1, category: 'REGISTRO', correctAnswer: 'furthermore' }),
        makeError({ sessionId: 1, category: 'DISCURSO', correctAnswer: 'whereas' }),
        // Solo el primero vuelve a aparecer.
        makeError({ sessionId: 2, category: 'REGISTRO', correctAnswer: 'furthermore' }),
        makeError({ sessionId: 2, category: 'LEXICO', correctAnswer: 'nuevo' }),
      ],
    });

    const result = q6RewriteEfficacy(data, opts);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      originalId: 100,
      rewriteId: 101,
      originalErrors: 2,
      repeatedErrors: 1,
      pctRepeated: 50,
    });
    expect(result.pctRepeated).toBe(50);
  });

  it('empareja ignorando espacios y caja en la respuesta correcta', () => {
    const base = writingPair();
    const data = makeDataset({
      ...base,
      errors: [
        makeError({ sessionId: 1, category: 'DISCURSO', correctAnswer: 'Meanwhile' }),
        makeError({ sessionId: 2, category: 'DISCURSO', correctAnswer: '  meanwhile ' }),
      ],
    });

    expect(q6RewriteEfficacy(data, opts).pairs[0]?.repeatedErrors).toBe(1);
  });

  it('distingue errores que comparten respuesta pero no categoria', () => {
    const base = writingPair();
    const data = makeDataset({
      ...base,
      errors: [
        makeError({ sessionId: 1, category: 'DISCURSO', correctAnswer: 'however' }),
        makeError({ sessionId: 2, category: 'REGISTRO', correctAnswer: 'however' }),
      ],
    });

    expect(q6RewriteEfficacy(data, opts).pairs[0]?.repeatedErrors).toBe(0);
  });

  it('distingue por subcategoria', () => {
    const base = writingPair();
    const data = makeDataset({
      ...base,
      errors: [
        makeError({
          sessionId: 1,
          category: 'WORD_FORMATION',
          subcategory: '-ance/-ence',
          correctAnswer: 'persistence',
        }),
        makeError({
          sessionId: 2,
          category: 'WORD_FORMATION',
          subcategory: '-ity',
          correctAnswer: 'persistence',
        }),
      ],
    });

    expect(q6RewriteEfficacy(data, opts).pairs[0]?.repeatedErrors).toBe(0);
  });

  it('sin pares devuelve agregado nulo', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      pieces: [makePiece({ id: 100, sessionId: 1, rewriteOf: null })],
    });

    const result = q6RewriteEfficacy(data, opts);
    expect(result.pairs).toEqual([]);
    expect(result.pctRepeated).toBeNull();
  });

  it('un original sin errores no cuenta como 0% ni como 100%', () => {
    const base = writingPair();
    const data = makeDataset({
      ...base,
      errors: [makeError({ sessionId: 2, category: 'LEXICO' })],
    });

    const result = q6RewriteEfficacy(data, opts);
    expect(result.pairs[0]?.pctRepeated).toBeNull();
    expect(result.pctRepeated).toBeNull();
  });

  it('ignora una reescritura que apunta a un texto inexistente', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 2, date: daysAgo(3) })],
      pieces: [makePiece({ id: 101, sessionId: 2, rewriteOf: 999 })],
    });

    expect(q6RewriteEfficacy(data, opts).pairs).toEqual([]);
  });
});
