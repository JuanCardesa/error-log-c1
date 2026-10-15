import type { SessionRow } from '@/lib/domain/types';
import type { Messages } from '@/lib/i18n';
import { parseIsoDate } from '@/lib/time/dates';

/**
 * Presentación de fechas, prácticas y cifras en el idioma de la interfaz. Solo cambia lo
 * que se lee: los datos, las consultas y las exportaciones siguen en ISO.
 */

/** `2026-09-24` → `24 Sep` (`24 sep` en español). */
export function shortDate(iso: string, t: Messages): string {
  const date = parseIsoDate(iso);
  return `${String(date.getUTCDate())} ${t.format.months[date.getUTCMonth()] ?? ''}`;
}

/** `2026-09-24` → `Wednesday 24 Sep 2026`. */
export function longDate(iso: string, t: Messages): string {
  const date = parseIsoDate(iso);
  return `${t.format.weekdays[date.getUTCDay()] ?? ''} ${shortDate(iso, t)} ${String(date.getUTCFullYear())}`;
}

/** `2026-09-24` → `24 Sep 2026`. */
export function mediumDate(iso: string, t: Messages): string {
  return `${shortDate(iso, t)} ${String(parseIsoDate(iso).getUTCFullYear())}`;
}

/** Intervalo legible: `14 – 20 Sep`, o `31 Aug – 6 Sep` si cambia de mes. */
export function dateRange(fromIso: string, toIso: string, t: Messages): string {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${String(from.getUTCDate())} – ${shortDate(toIso, t)}`;
  }
  return `${shortDate(fromIso, t)} – ${shortDate(toIso, t)}`;
}

/** Marca de tiempo completa (ISO 8601) → `24 Sep, 10:30`, en hora local. */
export function dateTime(timestamp: string, t: Messages): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${String(date.getDate())} ${t.format.months[date.getMonth()] ?? ''}, ${hh}:${mm}`;
}

/** Cifra decimal con el separador del idioma: `5.71` → `5.71` (`5,71` en español). */
export function decimal(value: number, t: Messages, digits?: number): string {
  const text = digits === undefined ? String(value) : value.toFixed(digits);
  return text.replace('.', t.format.decimalSeparator);
}

/** Porcentaje: `87.5` → `87.5%` (`87,5 %` en español). */
export function percent(value: number, t: Messages): string {
  return t.format.percent(decimal(value, t));
}

type Format = Pick<SessionRow, 'paper' | 'part'>;

/** `RUOE · Part 3`, o «No exam format». */
export function practiceLabel(session: Format, t: Messages): string {
  if (session.paper === null) return t.format.noExamFormat;
  return `${t.labels.paper[session.paper]} · ${t.format.part(session.part)}`;
}

/** `Reading & Use of English · Part 3`, para cabeceras con espacio. */
export function practiceLongLabel(session: Format, t: Messages): string {
  if (session.paper === null) return t.format.noExamFormat;
  return `${t.labels.paperLong[session.paper]} · ${t.format.part(session.part)}`;
}

/**
 * Nombre de una sesión: su referencia, o práctica y fecha si no la tiene. No se inventa
 * un título que el usuario no haya escrito.
 */
export function sessionTitle(session: Pick<SessionRow, 'sourceRef' | 'paper' | 'part' | 'date'>, t: Messages): string {
  const ref = session.sourceRef?.trim() ?? '';
  return ref !== '' ? ref : `${practiceLabel(session, t)} · ${shortDate(session.date, t)}`;
}

/** `6 / 8`, o `—` en Writing, que no se mide por ítems. */
export function score(session: Pick<SessionRow, 'itemsCorrect' | 'itemsTotal'>, separator = ' / '): string {
  if (session.itemsTotal === null) return '—';
  return `${String(session.itemsCorrect ?? 0)}${separator}${String(session.itemsTotal)}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}
