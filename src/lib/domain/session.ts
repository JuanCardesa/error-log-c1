import type { Paper } from './enums';
import type { SessionFormat } from './types';

/** Drizzle infiere columnas independientes; el dominio conserva la relacion del CHECK. */
export function withSessionFormat<T extends { readonly paper: Paper | null; readonly part: number | null }>(
  row: T,
): T & SessionFormat {
  if (row.paper === null && row.part === null) return { ...row, paper: null, part: null };
  if (row.paper !== null && row.part !== null) return { ...row, paper: row.paper, part: row.part };
  throw new Error('Paper y part deben estar ambos informados o ambos sin formato de examen.');
}
