import type { Dataset, QueryOptions } from '../domain/types';
import { q1CauseSplit, q1ToCsv } from '../queries/q1CauseSplit';
import { q2CategoryRate, q2ToCsv } from '../queries/q2CategoryRate';
import { q3RuoeAccuracy, q3ToCsv } from '../queries/q3RuoeAccuracy';
import { q4FalseCertainties, q4ToCsv } from '../queries/q4FalseCertainties';
import { q5AnkiDebt, q5ToCsv } from '../queries/q5AnkiDebt';
import { q6RewriteEfficacy, q6ToCsv } from '../queries/q6RewriteEfficacy';
import { runRules } from '../rules';

/**
 * Exportacion. Un CSV por query, mas un volcado completo en JSON.
 *
 * El CSV permite llevarse una consulta y el JSON incluye las filas crudas para portabilidad.
 * La restauracion implementada usa las copias SQLite de pnpm db:backup.
 */

export const CSV_EXPORTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
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
};

export function toCsvExport(
  which: CsvExport,
  data: Dataset,
  options: QueryOptions,
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
  }
}

export interface JsonDump {
  readonly exportedAt: string;
  readonly windowDays: number;
  readonly rows: Dataset;
  readonly queries: {
    readonly q1: ReturnType<typeof q1CauseSplit>;
    readonly q2: ReturnType<typeof q2CategoryRate>;
    readonly q3: ReturnType<typeof q3RuoeAccuracy>;
    readonly q4: ReturnType<typeof q4FalseCertainties>;
    readonly q5: ReturnType<typeof q5AnkiDebt>;
    readonly q6: ReturnType<typeof q6RewriteEfficacy>;
  };
  readonly rules: ReturnType<typeof runRules>;
}

export function toJsonDump(data: Dataset, options: QueryOptions): JsonDump {
  return {
    exportedAt: options.now.toISOString(),
    windowDays: options.windowDays,
    // Las filas crudas son el respaldo: sin ellas el volcado no reconstruye nada.
    rows: data,
    queries: {
      q1: q1CauseSplit(data, options),
      q2: q2CategoryRate(data, options),
      q3: q3RuoeAccuracy(data, options),
      q4: q4FalseCertainties(data, { now: options.now }),
      q5: q5AnkiDebt(data, options),
      q6: q6RewriteEfficacy(data, options),
    },
    rules: runRules(data, options),
  };
}
