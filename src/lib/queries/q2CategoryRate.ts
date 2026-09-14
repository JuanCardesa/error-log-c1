import { toCsv } from '../csv/csv';
import type { Category } from '../domain/enums';
import type { Dataset, QueryOptions } from '../domain/types';
import { round, sliceWindow } from './window';

/**
 * Q2 · Categorias por tasa, no por volumen.
 *
 * Normalizada por items intentados: sin esto, las partes que mas se practican parecen
 * siempre las peores. El resultado es, literalmente, el temario de los proximos sabados.
 *
 * Denominador y numerador se restringen a sesiones **con items contabilizados**. Las
 * sesiones de Writing tienen `items_total = null` y no tienen items que contar: incluir
 * sus errores en el numerador sin que aporten al denominador inflaria todas las tasas.
 * Esos errores se reportan aparte en `excludedErrors` para que no desaparezcan callando.
 */

export interface Q2Row {
  readonly category: Category;
  readonly errors: number;
  /** Errores por cada 100 items intentados. */
  readonly ratePer100: number;
}

export interface Q2Result {
  readonly itemsAttempted: number;
  readonly rows: readonly Q2Row[];
  /** Errores de sesiones sin items contabilizados (Writing), fuera del calculo. */
  readonly excludedErrors: number;
}

export function q2CategoryRate(data: Dataset, options: QueryOptions): Q2Result {
  const { sessions, pairs } = sliceWindow(data, options.now, options.windowDays);

  let itemsAttempted = 0;
  for (const session of sessions) {
    if (session.itemsTotal !== null) itemsAttempted += session.itemsTotal;
  }

  const counts = new Map<Category, number>();
  let excludedErrors = 0;

  for (const { error, session } of pairs) {
    if (session.itemsTotal === null) {
      excludedErrors += 1;
      continue;
    }
    counts.set(error.category, (counts.get(error.category) ?? 0) + 1);
  }

  const rows: Q2Row[] = [...counts.entries()]
    .map(([category, count]) => ({
      category,
      errors: count,
      ratePer100: itemsAttempted === 0 ? 0 : round((100 * count) / itemsAttempted, 2),
    }))
    .sort((a, b) => b.ratePer100 - a.ratePer100 || a.category.localeCompare(b.category));

  return { itemsAttempted, rows, excludedErrors };
}

export function q2ToCsv(result: Q2Result): string {
  return toCsv(
    ['categoria', 'errores', 'errores_por_100_items', 'items_intentados'],
    result.rows.map((row) => [
      row.category,
      row.errors,
      row.ratePer100,
      result.itemsAttempted,
    ]),
  );
}
