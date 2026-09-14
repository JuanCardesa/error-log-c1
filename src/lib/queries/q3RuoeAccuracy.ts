import { toCsv } from '../csv/csv';
import type { Dataset, QueryOptions } from '../domain/types';
import { isoWeekOf } from '../time/isoWeek';
import { percentage, sliceWindow } from './window';

/**
 * Q3 · Precision RUOE por part y semana ISO.
 *
 * La que dice si seis semanas de drills de Part 3 han servido de algo. Matriz
 * part x semana; las celdas sin datos quedan vacias (`null`), que no es lo mismo que
 * un 0% y no debe pintarse igual.
 */

export interface Q3Cell {
  readonly part: number;
  readonly week: string;
  readonly correct: number;
  readonly total: number;
  readonly pct: number;
}

export interface Q3Row {
  readonly part: number;
  /** Una celda por semana de `weeks`, en el mismo orden. `null` si no hubo practica. */
  readonly cells: readonly (Q3Cell | null)[];
}

export interface Q3Result {
  /** Semanas presentes, orden ascendente. La etiqueta `YYYY-Www` ordena sola. */
  readonly weeks: readonly string[];
  readonly rows: readonly Q3Row[];
}

export function q3RuoeAccuracy(data: Dataset, options: QueryOptions): Q3Result {
  const { sessions } = sliceWindow(data, options.now, options.windowDays);

  const totals = new Map<string, { correct: number; total: number }>();
  const weeks = new Set<string>();
  const parts = new Set<number>();

  for (const session of sessions) {
    // El Writing no tiene items y los demas papers no son esta tabla.
    if (session.paper !== 'RUOE') continue;
    if (session.itemsTotal === null || session.itemsCorrect === null) continue;

    const week = isoWeekOf(session.date).label;
    const key = `${String(session.part)}|${week}`;
    weeks.add(week);
    parts.add(session.part);

    const bucket = totals.get(key);
    if (bucket === undefined) {
      totals.set(key, { correct: session.itemsCorrect, total: session.itemsTotal });
    } else {
      bucket.correct += session.itemsCorrect;
      bucket.total += session.itemsTotal;
    }
  }

  const weekList = [...weeks].sort();
  const partList = [...parts].sort((a, b) => a - b);

  const rows: Q3Row[] = partList.map((part) => ({
    part,
    cells: weekList.map((week) => {
      const bucket = totals.get(`${String(part)}|${week}`);
      if (bucket === undefined || bucket.total === 0) return null;
      return {
        part,
        week,
        correct: bucket.correct,
        total: bucket.total,
        pct: percentage(bucket.correct, bucket.total),
      };
    }),
  }));

  return { weeks: weekList, rows };
}

export function q3ToCsv(result: Q3Result): string {
  return toCsv(
    ['part', ...result.weeks],
    // Celda vacia = campo vacio, no un cero que mentiria sobre la precision.
    result.rows.map((row) => [
      row.part,
      ...row.cells.map((cell) => (cell === null ? null : cell.pct)),
    ]),
  );
}
