import type { SessionRow } from '@/lib/domain/types';
import { addDays, parseIsoDate, toIsoDate, toUtcIsoDate, windowStart } from '@/lib/time/dates';
import { isoWeekOf } from '@/lib/time/isoWeek';
import { dateRange } from './format';

/**
 * Semanas de la ventana en un eje continuo, solo para presentar. Q3 y su CSV conservan
 * su contrato (solo semanas con práctica); aquí aparecen también las semanas vacías, para
 * que un hueco no parezca continuidad, y se marcan las parciales en los bordes.
 */

export interface WeekColumn {
  /** `2026-W38`, la clave con la que Q3 agrupa. */
  readonly iso: string;
  /** Primer y último día incluidos en la ventana. */
  readonly start: string;
  readonly end: string;
  /** La ventana corta la semana: la cifra es de los días incluidos. */
  readonly partial: boolean;
  /** `14 – 20 sep`. */
  readonly range: string;
}

export function windowWeeks(now: Date, days: number): WeekColumn[] {
  const first = windowStart(now, days);
  const last = toIsoDate(now);
  const weeks: WeekColumn[] = [];
  const firstDate = parseIsoDate(first);
  let monday = addDays(firstDate, -((firstDate.getUTCDay() + 6) % 7));
  while (toUtcIsoDate(monday) <= last) {
    const mondayIso = toUtcIsoDate(monday);
    const sundayIso = toUtcIsoDate(addDays(monday, 6));
    const start = mondayIso < first ? first : mondayIso;
    const end = sundayIso > last ? last : sundayIso;
    weeks.push({
      iso: isoWeekOf(mondayIso).label,
      start,
      end,
      partial: start !== mondayIso || end !== sundayIso,
      range: dateRange(start, end),
    });
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** Sesiones de RUOE con ítems que componen la celda part × semana. */
export function sessionsInCell(sessions: readonly SessionRow[], part: number, week: WeekColumn): SessionRow[] {
  return sessions
    .filter((session) => session.paper === 'RUOE' && session.part === part && session.itemsTotal !== null
      && session.date >= week.start && session.date <= week.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
