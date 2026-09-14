import { toCsv } from '../csv/csv';
import { CAUSES, CAUSE_META, type Cause, type CauseSide } from '../domain/enums';
import type { Dataset, QueryOptions } from '../domain/types';
import { percentage, sliceWindow } from './window';

/**
 * Q1 · Reparto de causas.
 *
 * La consulta principal: dice si el problema es de conocimiento o de ejecucion.
 * Se devuelven **las seis causas siempre**, incluidas las que estan a cero. Un cero aqui
 * es informacion ("no fallas por tiempo"), no una fila que sobre.
 */

export interface Q1Row {
  readonly cause: Cause;
  readonly side: CauseSide;
  readonly n: number;
  readonly pct: number;
}

export interface Q1Result {
  readonly total: number;
  readonly rows: readonly Q1Row[];
  /** Porcentaje agregado por lado: el numerador de las reglas 0 y 1. */
  readonly bySide: Readonly<Record<CauseSide, number>>;
}

export function q1CauseSplit(data: Dataset, options: QueryOptions): Q1Result {
  const { errors } = sliceWindow(data, options.now, options.windowDays);

  // Record completo sobre la union de causas: indexarlo da `number`, no `number | undefined`.
  const counts = Object.fromEntries(CAUSES.map((cause) => [cause, 0])) as Record<Cause, number>;
  for (const error of errors) {
    counts[error.cause] += 1;
  }

  const total = errors.length;

  const rows: Q1Row[] = CAUSES.map((cause) => {
    const n = counts[cause];
    return { cause, side: CAUSE_META[cause].side, n, pct: percentage(n, total) };
  }).sort((a, b) => b.n - a.n || CAUSES.indexOf(a.cause) - CAUSES.indexOf(b.cause));

  const study = rows.reduce((sum, row) => (row.side === 'study' ? sum + row.n : sum), 0);

  return {
    total,
    rows,
    bySide: {
      study: percentage(study, total),
      exec: percentage(total - study, total),
    },
  };
}

export function q1ToCsv(result: Q1Result): string {
  return toCsv(
    ['causa', 'lado', 'n', 'pct'],
    result.rows.map((row) => [row.cause, row.side, row.n, row.pct]),
  );
}
