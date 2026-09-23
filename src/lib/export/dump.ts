import { EMPTY_ANKI_DATASET, type AnkiDataset, type Dataset, type QueryOptions } from '../domain/types';
import { q7AnkiReviews, q7ToCsv } from '../queries/q7AnkiReviews';
import { q1CauseSplit, q1ToCsv } from '../queries/q1CauseSplit';
import { q2CategoryRate, q2ToCsv } from '../queries/q2CategoryRate';
import { q3RuoeAccuracy, q3ToCsv } from '../queries/q3RuoeAccuracy';
import { q4FalseCertainties, q4ToCsv } from '../queries/q4FalseCertainties';
import { q5AnkiDebt, q5ToCsv } from '../queries/q5AnkiDebt';
import { q6RewriteEfficacy, q6ToCsv } from '../queries/q6RewriteEfficacy';

/**
 * Exportacion. Un CSV por query, mas un volcado completo en JSON.
 *
 * El CSV permite llevarse una consulta ya calculada. El JSON es solo tus datos: filas y
 * espejo de Anki, sin agregaciones. Las agregaciones se recalculan desde las filas, asi
 * que incluirlas solo era una copia del mismo dato con otra forma y otra fecha de
 * caducidad. La restauracion implementada usa las copias SQLite de pnpm db:backup.
 */

export const CSV_EXPORTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
export type CsvExport = (typeof CSV_EXPORTS)[number];

export function isCsvExport(value: string): value is CsvExport {
  return (CSV_EXPORTS as readonly string[]).includes(value);
}

export const CSV_LABELS: Readonly<Record<CsvExport, string>> = {
  q1: 'Reparto de causas',
  q2: 'Categorias por tasa',
  q3: 'Precision RUOE por part y semana',
  q4: 'Falsas certezas',
  q5: 'Deuda de Anki',
  q6: 'Eficacia del rewrite',
  q7: 'Repasos y fallos en Anki',
};

export function toCsvExport(
  which: CsvExport,
  data: Dataset,
  options: QueryOptions,
  anki: AnkiDataset = EMPTY_ANKI_DATASET,
): string {
  switch (which) {
    case 'q1':
      return q1ToCsv(q1CauseSplit(data, options));
    case 'q2':
      return q2ToCsv(q2CategoryRate(data, options));
    case 'q3':
      return q3ToCsv(q3RuoeAccuracy(data, options));
    case 'q4':
      // Ventana fija de 30 dias, no la conmutable (decision P2).
      return q4ToCsv(q4FalseCertainties(data, { now: options.now }));
    case 'q5':
      return q5ToCsv(q5AnkiDebt(data, options));
    case 'q6':
      return q6ToCsv(q6RewriteEfficacy(data, options));
    case 'q7':
      return q7ToCsv(q7AnkiReviews(anki, options));
  }
}

export interface JsonDump {
  readonly exportedAt: string;
  /** Las filas crudas son el respaldo: sin ellas el volcado no reconstruye nada. */
  readonly rows: Dataset;
  readonly anki: AnkiDataset;
}

/** No depende de la ventana: se lleva el historial entero, no un recorte. */
export function toJsonDump(data: Dataset, now: Date, anki: AnkiDataset = EMPTY_ANKI_DATASET): JsonDump {
  return { exportedAt: now.toISOString(), rows: data, anki };
}
