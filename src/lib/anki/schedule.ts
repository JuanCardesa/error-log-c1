import { toIsoDate } from '../time/dates';

/**
 * El día de Anki no empieza a medianoche.
 *
 * Anki reparte los repasos por su «next day starts at», 4:00 por defecto: un repaso de
 * la 1:30 del martes pertenece al lunes. Guardarlo por el calendario civil desplazaba un
 * día entero de repasos cada vez que se estudia de noche, y los recuentos no cuadraban
 * con los que enseña el propio Anki.
 */
export const DEFAULT_ROLLOVER_HOUR = 4;

const HOUR_MS = 3_600_000;

function readHour(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}

/**
 * `getPreferences` no devuelve la misma forma en todas las versiones de Anki, y no está
 * en todas las de AnkiConnect. Se busca donde suele estar y, si no aparece nada
 * utilizable, se usa el 4 documentado en vez de inventar un cero que nadie configuró.
 */
export function rolloverFrom(preferences: unknown): number {
  if (preferences === null || typeof preferences !== 'object') return DEFAULT_ROLLOVER_HOUR;
  const root = preferences as Record<string, unknown>;
  const nested = ['scheduling', 'sched'].map((key) => root[key])
    .filter((value): value is Record<string, unknown> => value !== null && typeof value === 'object');
  for (const source of [root, ...nested]) {
    const hour = readHour(source['rollover']);
    if (hour !== null) return hour;
  }
  return DEFAULT_ROLLOVER_HOUR;
}

/** Fecha del día de Anki al que pertenece un instante, en el calendario local. */
export function ankiDay(reviewedAt: Date, rolloverHour: number): string {
  return toIsoDate(new Date(reviewedAt.getTime() - rolloverHour * HOUR_MS));
}
