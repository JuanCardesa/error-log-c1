import { describe, expect, it } from 'vitest';

import { assessedCriteria, countByStatus, searchLibrary, selectLibrary, writingTotal, type LibraryEntry, type LibraryQuery } from './library';

const ALL: LibraryQuery = { q: '', genre: null, status: null, sort: 'recent' };

function entry(id: number, overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return { id, title: `Writing ${String(id)}`, text: null, genre: 'ESSAY', status: 'CORRECTED', date: '2026-10-01', total: null, ...overrides };
}

const bands = (content: number | null, communicative: number | null, organisation: number | null, language: number | null) => ({
  bandContent: content, bandCommunicative: communicative, bandOrganisation: organisation, bandLanguage: language,
});

describe('nota de una redacción', () => {
  it('suma los cuatro criterios, medios puntos incluidos', () => {
    expect(writingTotal(bands(4, 3, 3, 2.5))).toBe(12.5);
    expect(writingTotal(bands(0, 0, 0, 0))).toBe(0);
    expect(assessedCriteria(bands(4, 3, 3, 2.5))).toBe(4);
  });

  it('sin los cuatro no hay total: un criterio sin evaluar no es un cero', () => {
    expect(writingTotal(bands(4, 3, null, 2.5))).toBeNull();
    expect(writingTotal(bands(null, null, null, null))).toBeNull();
    expect(assessedCriteria(bands(4, null, null, 0))).toBe(2);
  });
});

describe('biblioteca', () => {
  const entries = [
    entry(1, { title: 'Making cities more liveable', text: 'Green spaces are also important, but their effect is limited.', date: '2026-10-02', total: 12.5 }),
    entry(2, { title: 'A café worth visiting', genre: 'REVIEW', status: 'AWAITING', date: '2026-10-09', text: 'The coffee was excellent.' }),
    entry(3, { title: 'Writing · Part 1 · 1 Sep', date: '2026-09-01', total: 10 }),
    entry(4, { title: 'Sports centre', genre: 'REPORT', status: 'NOT_SUBMITTED', date: '2026-10-02', text: 'Introduction' }),
  ];
  const ids = (query: Partial<LibraryQuery>) => selectLibrary(entries, { ...ALL, ...query }).map((item) => item.id);

  it('ordena de más reciente a más antigua y, el mismo día, la última registrada primero', () => {
    expect(ids({})).toEqual([2, 4, 1, 3]);
    expect(ids({ sort: 'oldest' })).toEqual([3, 1, 4, 2]);
  });

  it('por nota deja al final las que no tienen total', () => {
    expect(ids({ sort: 'score' })).toEqual([1, 3, 2, 4]);
  });

  it('busca en el título y en el texto, sin acentos ni mayúsculas y con todas las palabras', () => {
    expect(ids({ q: 'cafe' })).toEqual([2]);
    expect(ids({ q: 'GREEN effect' })).toEqual([1]);
    expect(ids({ q: 'green coffee' })).toEqual([]);
    expect(ids({ q: '  ' })).toEqual([2, 4, 1, 3]);
    // Un texto antiguo, sin transcripción, se encuentra por su título.
    expect(ids({ q: 'part 1' })).toEqual([3]);
  });

  it('filtra por tipo y por estado; «Sin entregar» solo aparece en todas', () => {
    expect(ids({ genre: 'REVIEW' })).toEqual([2]);
    expect(ids({ status: 'AWAITING' })).toEqual([2]);
    expect(ids({ status: 'CORRECTED' })).toEqual([1, 3]);
    expect(ids({ status: 'CORRECTED', genre: 'REPORT' })).toEqual([]);
  });

  it('cuenta pendientes y corregidas entre lo que cumple la búsqueda y el tipo', () => {
    expect(countByStatus(searchLibrary(entries, ALL))).toEqual({ AWAITING: 1, CORRECTED: 2 });
    expect(countByStatus(searchLibrary(entries, { q: 'cafe', genre: null }))).toEqual({ AWAITING: 1, CORRECTED: 0 });
  });
});
