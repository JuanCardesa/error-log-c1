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
      metric: 'CONTENT', genre: null, from: null, to: null,
    });
    expect(result.points.map(({ id, value }) => [id, value])).toEqual([[1, 5], [2, 4]]);
  });

  it('mantiene los puntos con fecha aproximada y conserva su marca', () => {
    const result = writingProgress([
      piece({ id: 1, date: '2026-01-02' }),
      piece({ id: 2, date: '2026-01-03', dateBasis: 'IMPORTED' }),
    ], { metric: 'TOTAL', genre: null, from: null, to: null });
    expect(result.points).toHaveLength(2);
    expect(result.points[1]?.dateBasis).toBe('IMPORTED');
  });

  it('filtra por tipo y fechas inclusivas', () => {
    const items = [
      piece({ id: 1, date: '2026-01-01', genre: 'ESSAY', bandContent: 1 }),
      piece({ id: 2, date: '2026-01-02', genre: 'REPORT', bandContent: 2 }),
      piece({ id: 3, date: '2026-01-03', genre: 'ESSAY', bandContent: 3 }),
    ];
    const result = writingProgress(items, { metric: 'CONTENT', genre: 'ESSAY', from: '2026-01-02', to: '2026-01-03' });
    expect(result.points.map(({ id }) => id)).toEqual([3]);
  });

  it('excluye pendientes de las medias, pero conserva en el gráfico las notas ya existentes', () => {
    const result = writingProgress([
      piece({ id: 1, date: '2026-01-01', status: 'AWAITING', bandContent: 5 }),
      piece({ id: 2, date: '2026-01-02', bandContent: 3 }),
    ], { metric: 'CONTENT', genre: null, from: null, to: null });
    expect(result.awaiting).toBe(1);
    expect(result.points.map(({ id }) => id)).toEqual([1, 2]);
    expect(result.criteria[0]).toMatchObject({ mean: 3, count: 1, last: 3 });
  });

  it('cuenta criterios parciales por separado y solo forma el total con cuatro bandas', () => {
    const partial = piece({ id: 1, date: '2026-01-01', bandContent: 4, bandLanguage: null });
    const total = writingProgress([partial], { metric: 'TOTAL', genre: null, from: null, to: null });
    const content = writingProgress([partial], { metric: 'CONTENT', genre: null, from: null, to: null });
    expect(total.points).toEqual([]);
    expect(content.points[0]?.value).toBe(4);
    expect(content.criteria[0]).toMatchObject({ mean: 4, count: 1, last: 4 });
    expect(content.criteria[3]).toMatchObject({ mean: null, count: 0, last: null });
  });

  it('solo destaca criterios con n de tres y una diferencia de al menos 0,5', () => {
    const pair = [
      piece({ id: 1, date: '2026-01-01', bandContent: 4, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 2 }),
      piece({ id: 2, date: '2026-01-02', bandContent: 4, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 2 }),
    ];
    const tooFew = writingProgress(pair, { metric: 'TOTAL', genre: null, from: null, to: null });
    expect(tooFew.strongest).toBeNull();

    const enough = writingProgress([...pair, piece({ id: 3, date: '2026-01-03', bandContent: 4, bandCommunicative: 3, bandOrganisation: 3, bandLanguage: 2 })], {
      metric: 'TOTAL', genre: null, from: null, to: null,
    });
    expect(enough.strongest).toBe('CONTENT');
    expect(enough.mostRoomToImprove).toBe('LANGUAGE');
  });

  it('normaliza filtros inválidos y acepta medida, tipo y fechas válidas', () => {
    expect(parseProgressFilters({ measure: 'LANGUAGE', type: 'REPORT', from: '2026-01-01', to: '2026-01-31' }))
      .toEqual({ metric: 'LANGUAGE', genre: 'REPORT', from: '2026-01-01', to: '2026-01-31' });
    expect(parseProgressFilters({ measure: 'SCALE', type: 'UNKNOWN', from: '2026-02-30', to: ['2026-01-01'] }))
      .toEqual({ metric: 'TOTAL', genre: null, from: null, to: null });
  });
});
