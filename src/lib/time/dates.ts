/**
 * Aritmetica de fechas civiles (`YYYY-MM-DD`) en UTC.
 *
 * Todo se hace en UTC a proposito: una sesion registrada el dia 1 a las 23:00 en Madrid
 * no puede contar como del dia 2 porque el servidor este en otra zona. La fecha de una
 * sesion es un dato civil que escribe la persona, no un instante.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  // Rechaza fechas que existen como cadena pero no como dia (2026-02-30).
  return toIsoDate(parseIsoDate(value)) === value;
}

/** `YYYY-MM-DD` -> `Date` a medianoche UTC. Lanza si la cadena no tiene la forma. */
export function parseIsoDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (match === null) throw new RangeError(`Fecha ISO invalida: ${value}`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** `Date` -> `YYYY-MM-DD`, tomando los componentes UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Primer dia incluido en una ventana de `days` dias que termina en `now`.
 *
 * La ventana es inclusiva en ambos extremos: con `days = 30` entran hoy y los 29 dias
 * anteriores. Es lo que espera alguien que dice "los ultimos 30 dias".
 */
export function windowStart(now: Date, days: number): string {
  const today = parseIsoDate(toIsoDate(now));
  return toIsoDate(addDays(today, -(days - 1)));
}

/** Si una fecha civil cae dentro de la ventana que termina en `now`. */
export function inWindow(date: string, now: Date, days: number): boolean {
  return date >= windowStart(now, days) && date <= toIsoDate(now);
}
