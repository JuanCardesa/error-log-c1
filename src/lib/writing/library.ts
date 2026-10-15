import type { Genre, WritingStatus } from '../domain/enums';
import { normalizeNotebookSearchText } from '../notebook/searchText';

/**
 * La biblioteca de redacciones: búsqueda, filtros y orden. Son decenas de textos, no miles:
 * se filtran en memoria con la misma normalización sin acentos que el Notebook.
 */

export interface Bands {
  readonly bandContent: number | null;
  readonly bandCommunicative: number | null;
  readonly bandOrganisation: number | null;
  readonly bandLanguage: number | null;
}

const bandsOf = (piece: Bands) => [piece.bandContent, piece.bandCommunicative, piece.bandOrganisation, piece.bandLanguage];

/** Criterios evaluados, de 0 a 4. */
export function assessedCriteria(piece: Bands): number {
  return bandsOf(piece).filter((band) => band !== null).length;
}

/** La nota sobre 20, solo con los cuatro criterios: con tres no hay total. */
export function writingTotal(piece: Bands): number | null {
  let total = 0;
  for (const band of bandsOf(piece)) {
    if (band === null) return null;
    total += band;
  }
  return total;
}

export const LIBRARY_SORTS = ['recent', 'oldest', 'score'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Las pendientes y las corregidas; «Sin entregar» solo se ve en «Todas». */
export const LIBRARY_STATUSES = ['AWAITING', 'CORRECTED'] as const satisfies readonly WritingStatus[];
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export interface LibraryQuery {
  readonly q: string;
  readonly genre: Genre | null;
  readonly status: LibraryStatus | null;
  readonly sort: LibrarySort;
}

export interface LibraryEntry {
  readonly id: number;
  /** El que se enseña: el guardado o, en los textos antiguos, el de su sesión. */
  readonly title: string;
  readonly text: string | null;
  readonly genre: Genre;
  readonly status: WritingStatus;
  readonly date: string;
  readonly total: number | null;
}

/** Cada palabra de la búsqueda tiene que aparecer en el título o en el texto. */
function matcher(q: string): (entry: LibraryEntry) => boolean {
  const terms = normalizeNotebookSearchText(q).split(' ').filter((term) => term !== '');
  if (terms.length === 0) return () => true;
  return (entry) => {
    const haystack = normalizeNotebookSearchText(`${entry.title}\n${entry.text ?? ''}`);
    return terms.every((term) => haystack.includes(term));
  };
}

const byRecent = (a: LibraryEntry, b: LibraryEntry) => b.date.localeCompare(a.date) || b.id - a.id;

const SORTERS: Readonly<Record<LibrarySort, (a: LibraryEntry, b: LibraryEntry) => number>> = {
  recent: byRecent,
  oldest: (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  // Sin total al final: «sin nota» no es una nota baja.
  score: (a, b) => (b.total ?? -1) - (a.total ?? -1) || byRecent(a, b),
};

/** Lo que cumple la búsqueda y el tipo, antes de filtrar por estado: de ahí salen los recuentos. */
export function searchLibrary<T extends LibraryEntry>(entries: readonly T[], query: Pick<LibraryQuery, 'q' | 'genre'>): T[] {
  const matches = matcher(query.q);
  return entries.filter((entry) => (query.genre === null || entry.genre === query.genre) && matches(entry));
}

export function selectLibrary<T extends LibraryEntry>(entries: readonly T[], query: LibraryQuery): T[] {
  return searchLibrary(entries, query)
    .filter((entry) => query.status === null || entry.status === query.status)
    .sort(SORTERS[query.sort]);
}

export function countByStatus(entries: readonly LibraryEntry[]): Readonly<Record<LibraryStatus, number>> {
  return {
    AWAITING: entries.filter((entry) => entry.status === 'AWAITING').length,
    CORRECTED: entries.filter((entry) => entry.status === 'CORRECTED').length,
  };
}
