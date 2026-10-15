import { GENRES } from '@/lib/domain/enums';
import type { LibraryQuery, LibrarySort, LibraryStatus } from '@/lib/writing/library';
import type { SearchParams } from '../_shared/window';

/**
 * La búsqueda, los filtros y el orden de la biblioteca viven en la URL: volver desde una
 * redacción recupera la misma lista. Los valores por defecto no se escriben.
 */

const STATUS_PARAM: Readonly<Record<string, LibraryStatus>> = { pendientes: 'AWAITING', corregidas: 'CORRECTED' };
const SORT_PARAM: Readonly<Record<string, LibrarySort>> = { antiguas: 'oldest', nota: 'score' };

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');
const valueOf = <T extends string>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.entries(map).find(([name]) => name === key)?.[1];
const keyOf = <T extends string>(map: Readonly<Record<string, T>>, value: T): string | undefined =>
  Object.entries(map).find(([, mapped]) => mapped === value)?.[0];

export function parseLibraryQuery(params: SearchParams): LibraryQuery {
  const genre = one(params['tipo']);
  return {
    q: one(params['q']).slice(0, 200),
    genre: GENRES.find((value) => value === genre) ?? null,
    status: valueOf(STATUS_PARAM, one(params['estado'])) ?? null,
    sort: valueOf(SORT_PARAM, one(params['orden'])) ?? 'recent',
  };
}

export function libraryHref(query: LibraryQuery, overrides: Partial<LibraryQuery>): string {
  const merged: LibraryQuery = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.q !== '') params.set('q', merged.q);
  if (merged.genre !== null) params.set('tipo', merged.genre);
  const status = merged.status === null ? undefined : keyOf(STATUS_PARAM, merged.status);
  if (status !== undefined) params.set('estado', status);
  const sort = keyOf(SORT_PARAM, merged.sort);
  if (sort !== undefined) params.set('orden', sort);
  const text = params.toString();
  return text === '' ? '/writing' : `/writing?${text}`;
}

export const isFiltered = (query: LibraryQuery): boolean => query.q !== '' || query.genre !== null || query.status !== null;
