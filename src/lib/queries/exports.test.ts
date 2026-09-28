import { beforeEach, describe, expect, it } from 'vitest';

import { NOW, makeDataset, makeError, makeSession, resetIds } from './fixtures/build';
import { q4FalseCertainties, q4ToCsv } from './q4FalseCertainties';

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
});
