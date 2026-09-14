import { parseIsoDate } from './dates';

/**
 * Semana ISO 8601.
 *
 * No se usa `strftime('%W')` de SQLite porque no es ISO: cuenta desde el primer lunes
 * del año y descuadra en el cambio de año. En ISO, la semana 1 es la que contiene el
 * primer jueves, asi que el 2026-01-01 (jueves) cae en 2026-W01, pero el 2024-12-30
 * (lunes) cae en 2025-W01, no en 2024-W53.
 */

export interface IsoWeek {
  readonly year: number;
  readonly week: number;
  /** `2026-W07`, ordenable lexicograficamente. */
  readonly label: string;
}

export function isoWeekOf(date: string): IsoWeek {
  const parsed = parseIsoDate(date);

  // Al jueves de esta semana: su año es, por definicion, el año ISO.
  const target = new Date(parsed.getTime());
  const dayOfWeek = (target.getUTCDay() + 6) % 7; // lunes = 0
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);

  const year = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);

  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));

  return { year, week, label: formatIsoWeek(year, week) };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${String(year)}-W${String(week).padStart(2, '0')}`;
}
