import { describe, expect, it } from 'vitest';

import { parseProgressFilters, writingProgress, type ProgressPiece } from './progress';

function piece(overrides: Partial<ProgressPiece> & Pick<ProgressPiece, 'id' | 'date'>): ProgressPiece {
  return {
    dateBasis: 'WRITTEN', genre: 'ESSAY', status: 'CORRECTED',
    bandContent: 3, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 3,
    ...overrides,
  };
}

describe('progreso de Writing', () => {
  it('ordena cronológicamente y no duplica IDs', () => {
    const older = piece({ id: 1, date: '2026-01-02', bandContent: 2 });
    const later = piece({ id: 2, date: '2026-02-02', bandContent: 4 });
    const result = writingProgress([later, older, { ...older, bandContent: 5 }], {
      metric: 'CONTENT', genre: null,
    });
    expect(result.points.map(({ id, value }) => [id, value])).toEqual([[1, 5], [2, 4]]);
  });

  it('mantiene los puntos con fecha aproximada y conserva su marca', () => {
    const result = writingProgress([
      piece({ id: 1, date: '2026-01-02' }),
      piece({ id: 2, date: '2026-01-03', dateBasis: 'IMPORTED' }),
    ], { metric: 'TOTAL', genre: null });
    expect(result.points).toHaveLength(2);
    expect(result.points[1]?.dateBasis).toBe('IMPORTED');
  });

  it('filtra por tipo', () => {
    const items = [
      piece({ id: 1, date: '2026-01-01', genre: 'ESSAY', bandContent: 1 }),
      piece({ id: 2, date: '2026-01-02', genre: 'REPORT', bandContent: 2 }),
      piece({ id: 3, date: '2026-01-03', genre: 'ESSAY', bandContent: 3 }),
    ];
    const result = writingProgress(items, { metric: 'CONTENT', genre: 'ESSAY' });
    expect(result.points.map(({ id }) => id)).toEqual([1, 3]);
  });

  it('excluye pendientes de las medias, pero conserva en el gráfico las notas ya existentes', () => {
    const result = writingProgress([
      piece({ id: 1, date: '2026-01-01', status: 'AWAITING', bandContent: 5 }),
      piece({ id: 2, date: '2026-01-02', bandContent: 3 }),
    ], { metric: 'CONTENT', genre: null });
    expect(result.awaiting).toBe(1);
    expect(result.points.map(({ id }) => id)).toEqual([1, 2]);
    expect(result.criteria[0]).toMatchObject({ mean: 3, count: 1, last: 3 });
  });

  it('cuenta criterios parciales por separado y solo forma el total con cuatro bandas', () => {
    const partial = piece({ id: 1, date: '2026-01-01', bandContent: 4, bandLanguage: null });
    const total = writingProgress([partial], { metric: 'TOTAL', genre: null });
    const content = writingProgress([partial], { metric: 'CONTENT', genre: null });
    expect(total.points).toEqual([]);
    expect(content.points[0]?.value).toBe(4);
    expect(content.criteria[0]).toMatchObject({ mean: 4, count: 1, last: 4 });
    expect(content.criteria[3]).toMatchObject({ mean: null, count: 0, last: null });
  });

  it('abre con el criterio de media más baja y avisa de la muestra pequeña', () => {
    const pair = [
      piece({ id: 1, date: '2026-01-01', bandContent: 4, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 2 }),
      piece({ id: 2, date: '2026-01-02', bandContent: 4, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 3 }),
    ];
    const few = writingProgress(pair, { metric: 'TOTAL', genre: null });
    expect(few.focus).toEqual({ kind: 'weakest', criteria: ['LANGUAGE'], mean: 2.5 });
    expect(few.smallSample).toBe(true);
    expect(few.assessed).toBe(2);

    const enough = writingProgress([...pair, piece({ id: 3, date: '2026-01-03', bandLanguage: 2.5 })], { metric: 'TOTAL', genre: null });
    expect(enough.smallSample).toBe(false);
  });

  it('nombra todos los empatados y, si los cuatro van a menos de medio punto, no señala ninguno', () => {
    const tied = writingProgress([
      piece({ id: 1, date: '2026-01-01', bandContent: 4, bandCommunicative: 4, bandOrganisation: 2, bandLanguage: 2 }),
    ], { metric: 'TOTAL', genre: null });
    expect(tied.focus).toEqual({ kind: 'weakest', criteria: ['ORGANISATION', 'LANGUAGE'], mean: 2 });

    const even = writingProgress([
      piece({ id: 1, date: '2026-01-01', bandContent: 3.5 }),
      piece({ id: 2, date: '2026-01-02' }),
    ], { metric: 'TOTAL', genre: null });
    expect(even.focus).toEqual({ kind: 'even', low: 3, high: 3.25 });
  });

  it('sin notas no abre con ningún criterio', () => {
    const awaiting = writingProgress([
      piece({ id: 1, date: '2026-01-01', status: 'AWAITING', bandContent: null, bandCommunicative: null, bandOrganisation: null, bandLanguage: null }),
    ], { metric: 'TOTAL', genre: null });
    expect(awaiting.focus).toEqual({ kind: 'none' });
    expect(awaiting.assessed).toBe(0);
    expect(awaiting.awaiting).toBe(1);
  });

  it('normaliza filtros inválidos y acepta medida y tipo válidos', () => {
    expect(parseProgressFilters({ measure: 'LANGUAGE', type: 'REPORT' }))
      .toEqual({ metric: 'LANGUAGE', genre: 'REPORT' });
    expect(parseProgressFilters({ measure: 'SCALE', type: ['ESSAY'] }))
      .toEqual({ metric: 'TOTAL', genre: null });
  });
});
