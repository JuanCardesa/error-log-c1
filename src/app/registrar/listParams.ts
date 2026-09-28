import type { SearchParams } from '../_shared/window';

/**
 * Parámetros del historial de sesiones. Viven en la URL para que volver desde una
 * sesión recupere la misma búsqueda, filtros y página.
 */
export interface ListParams {
  readonly q: string;
  /** `abiertas` o vacío. */
  readonly estado: string;
  /** Paper, `libre` (sin formato de examen) o vacío. */
  readonly practica: string;
  /** `asc` o vacío (más recientes primero). */
  readonly orden: string;
  readonly p: number;
}

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

export function parseListParams(params: SearchParams): ListParams {
  const page = Number(one(params['p']));
  const practica = one(params['practica']);
  return {
    q: one(params['q']).slice(0, 200),
    estado: one(params['estado']) === 'abiertas' ? 'abiertas' : '',
    practica: ['RUOE', 'WRITING', 'LISTENING', 'SPEAKING', 'libre'].includes(practica) ? practica : '',
    orden: one(params['orden']) === 'asc' ? 'asc' : '',
    p: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function listHref(params: ListParams, overrides: Partial<ListParams>): string {
  const merged = { ...params, p: 1, ...overrides };
  const query = new URLSearchParams();
  if (merged.q !== '') query.set('q', merged.q);
  if (merged.estado !== '') query.set('estado', merged.estado);
  if (merged.practica !== '') query.set('practica', merged.practica);
  if (merged.orden !== '') query.set('orden', merged.orden);
  if (merged.p > 1) query.set('p', String(merged.p));
  const text = query.toString();
  return text === '' ? '/registrar' : `/registrar?${text}`;
}

export const hasFilters = (params: ListParams): boolean =>
  params.q !== '' || params.estado !== '' || params.practica !== '';
