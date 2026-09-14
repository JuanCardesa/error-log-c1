import { beforeEach, describe, expect, it } from 'vitest';

import type { QueryOptions } from '../domain/types';
import {
  NOW,
  daysAgo,
  makeDataset,
  makeError,
  makePiece,
  makeSession,
  resetIds,
} from './fixtures/build';
import { q4FalseCertainties, q4ToCsv } from './q4FalseCertainties';
import { q5AnkiDebt, q5ToCsv } from './q5AnkiDebt';
import { q6RewriteEfficacy, q6ToCsv } from './q6RewriteEfficacy';

const opts: QueryOptions = { now: NOW, windowDays: 30 };

beforeEach(() => {
  resetIds();
});

describe('exportacion a CSV', () => {
  it('Q4 escapa la regla cuando lleva comas y comillas', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, date: '2026-09-13' })],
      errors: [
        makeError({
          sessionId: 1,
          confidence: 'SEGURO',
          cause: 'CONFUSION',
          category: 'ESTRUCTURA',
          subcategory: null,
          myAnswer: 'it was only his voice',
          correctAnswer: 'it was only by his voice',
          ruleNote: 'En las cleft con "it was... that", la preposicion no desaparece',
        }),
      ],
    });

    const csv = q4ToCsv(q4FalseCertainties(data, { now: NOW }));
    const [header, row] = csv.trimEnd().split('\r\n');

    expect(header).toBe('fecha,causa,categoria,subcategoria,mi_respuesta,correcta,regla');
    expect(row).toBe(
      '2026-09-13,CONFUSION,ESTRUCTURA,,it was only his voice,it was only by his voice,' +
        '"En las cleft con ""it was... that"", la preposicion no desaparece"',
    );
  });

  it('Q4 exporta solo la cabecera si no hay falsas certezas', () => {
    const csv = q4ToCsv(q4FalseCertainties(makeDataset(), { now: NOW }));
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('Q5 exporta el ratio junto al umbral con el que se compara', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [
        makeError({
          sessionId: 1,
          cause: 'CONFUSION',
          ankiAdded: true,
          ankiAddedAt: '2026-09-13T19:00:00.000Z',
        }),
        makeError({ sessionId: 1, cause: 'ORTOGRAFIA', ankiAdded: false }),
      ],
    });

    expect(q5ToCsv(q5AnkiDebt(data, opts))).toBe(
      'elegibles,convertidos,pendientes,pct_convertidos,umbral\r\n2,1,1,50,80\r\n',
    );
  });

  it('Q5 deja vacio el porcentaje cuando no hay nada que convertir', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [makeError({ sessionId: 1, cause: 'DESPISTE' })],
    });
    // Campo vacio, no un 0 que se leeria como "no has convertido nada".
    expect(q5ToCsv(q5AnkiDebt(data, opts))).toBe(
      'elegibles,convertidos,pendientes,pct_convertidos,umbral\r\n0,0,0,,80\r\n',
    );
  });

  it('Q6 exporta una fila por par original/reescritura', () => {
    const data = makeDataset({
      sessions: [
        makeSession({
          id: 1,
          kind: 'WRITING',
          paper: 'WRITING',
          part: 1,
          date: daysAgo(10),
          itemsTotal: null,
          itemsCorrect: null,
        }),
        makeSession({
          id: 2,
          kind: 'WRITING',
          paper: 'WRITING',
          part: 1,
          date: daysAgo(3),
          itemsTotal: null,
          itemsCorrect: null,
        }),
      ],
      pieces: [
        makePiece({ id: 100, sessionId: 1, rewriteOf: null }),
        makePiece({ id: 101, sessionId: 2, rewriteOf: 100, genre: 'ESSAY' }),
      ],
      errors: [
        makeError({ sessionId: 1, category: 'DISCURSO', correctAnswer: 'however' }),
        makeError({ sessionId: 2, category: 'DISCURSO', correctAnswer: 'however' }),
      ],
    });

    expect(q6ToCsv(q6RewriteEfficacy(data, opts))).toBe(
      'original_id,rewrite_id,genero,errores_original,repetidos,pct_repetidos\r\n' +
        '100,101,ESSAY,1,1,100\r\n',
    );
  });

  it('Q6 exporta solo la cabecera si no hay reescrituras', () => {
    const csv = q6ToCsv(q6RewriteEfficacy(makeDataset(), opts));
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });
});
