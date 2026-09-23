import { addDays, parseIsoDate, toIsoDate, toUtcIsoDate } from '../time/dates';

/**
 * El día de Anki no empieza a medianoche.
 *
 * Anki reparte los repasos por su «next day starts at», 4:00 por defecto: un repaso de
 * la 1:30 del martes pertenece al lunes. Guardarlo por el calendario civil desplazaba un
 * día entero de repasos cada vez que se estudia de noche, y los recuentos no cuadraban
 * con los que enseña el propio Anki.
 *
 * Verificado contra una instalación real: esa versión de AnkiConnect expone 121 acciones
 * y **ninguna** devuelve el corte de la colección (`getPreferences` responde «unsupported
 * action», y `getDeckConfig` son opciones de mazo). Se intenta leerlo igualmente por si
 * una versión futura lo añade, pero el camino que funciona hoy es declararlo a mano con
 * `ANKI_ROLLOVER_HOUR`; si no, se asume el valor por defecto de Anki y se dice que es una
 * suposición, en vez de enseñar una cifra que parece leída de la colección.
 */
export const DEFAULT_ROLLOVER_HOUR = 4;

export type RolloverSource = 'anki' | 'config' | 'default';
export interface Rollover {
  readonly hour: number;
  readonly source: RolloverSource;
}

export function isRolloverHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

/** Busca el corte donde suele estar. `null` si la respuesta no trae nada utilizable. */
export function rolloverHourIn(preferences: unknown): number | null {
  if (preferences === null || typeof preferences !== 'object') return null;
  const root = preferences as Record<string, unknown>;
  const nested = ['scheduling', 'sched'].map((key) => root[key])
    .filter((value): value is Record<string, unknown> => value !== null && typeof value === 'object');
  for (const source of [root, ...nested]) {
    if (isRolloverHour(source['rollover'])) return source['rollover'];
  }
  return null;
}

/** Lo declarado a mano gana: es una afirmación del usuario, no una deducción. */
export function resolveRollover(preferences: unknown, configured?: number): Rollover {
  if (configured !== undefined) return { hour: configured, source: 'config' };
  const hour = rolloverHourIn(preferences);
  return hour === null ? { hour: DEFAULT_ROLLOVER_HOUR, source: 'default' } : { hour, source: 'anki' };
}

/**
 * Fecha del día de Anki al que pertenece un instante, en el calendario local.
 *
 * Se compara la hora del reloj con el corte y se retrocede un día civil. Restar la
 * duración del corte al instante absoluto parecía equivalente y no lo es: en los días
 * con cambio de hora el reloj local salta o repite una hora, y el resultado se iba un
 * día entero. El día anterior se calcula en UTC, que es donde la aritmética civil no
 * depende de la zona.
 */
export function ankiDay(reviewedAt: Date, rolloverHour: number): string {
  const civil = toIsoDate(reviewedAt);
  if (reviewedAt.getHours() >= rolloverHour) return civil;
  return toUtcIsoDate(addDays(parseIsoDate(civil), -1));
}
