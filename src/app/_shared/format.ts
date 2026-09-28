import type { SessionRow } from '@/lib/domain/types';
import { parseIsoDate } from '@/lib/time/dates';
import { PAPER_LABELS, PAPER_LONG_LABELS } from './labels';

/**
 * Presentación de fechas, prácticas y cifras. Solo cambia lo que se lee: los datos, las
 * consultas y las exportaciones siguen en ISO.
 */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** `2026-09-24` → `24 sep`. */
export function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}

/** `2026-09-24` → `miércoles 24 sep 2026`. */
export function longDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${shortDate(iso)} ${String(date.getUTCFullYear())}`;
}

/** `2026-09-24` → `24 sep 2026`. */
export function mediumDate(iso: string): string {
  return `${shortDate(iso)} ${String(parseIsoDate(iso).getUTCFullYear())}`;
}

/** Intervalo legible: `14 – 20 sep`, o `31 ago – 6 sep` si cambia de mes. */
export function dateRange(fromIso: string, toIso: string): string {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${String(from.getUTCDate())} – ${shortDate(toIso)}`;
  }
  return `${shortDate(fromIso)} – ${shortDate(toIso)}`;
}

/** Marca de tiempo completa (ISO 8601) → `24 sep, 10:30`, en hora local. */
export function dateTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}, ${hh}:${mm}`;
}

/** Cifra decimal con coma: `5.71` → `5,71`. */
export function decimal(value: number, digits?: number): string {
  const text = digits === undefined ? String(value) : value.toFixed(digits);
  return text.replace('.', ',');
}

/** Porcentaje con coma y espacio fino: `87.5` → `87,5 %`. */
export function percent(value: number): string {
  return `${decimal(value)} %`;
}

type Format = Pick<SessionRow, 'paper' | 'part'>;

/** `RUOE · Part 3`, o «Sin formato de examen». */
export function practiceLabel(session: Format): string {
  if (session.paper === null) return 'Sin formato de examen';
  return `${PAPER_LABELS[session.paper]} · Part ${String(session.part)}`;
}

/** `Reading & Use of English · Part 3`, para cabeceras con espacio. */
export function practiceLongLabel(session: Format): string {
  if (session.paper === null) return 'Sin formato de examen';
  return `${PAPER_LONG_LABELS[session.paper]} · Part ${String(session.part)}`;
}

/**
 * Nombre de una sesión: su referencia, o práctica y fecha si no la tiene. No se inventa
 * un título que el usuario no haya escrito.
 */
export function sessionTitle(session: Pick<SessionRow, 'sourceRef' | 'paper' | 'part' | 'date'>): string {
  const ref = session.sourceRef?.trim() ?? '';
  return ref !== '' ? ref : `${practiceLabel(session)} · ${shortDate(session.date)}`;
}

/** `6 / 8`, o `—` en Writing, que no se mide por ítems. */
export function score(session: Pick<SessionRow, 'itemsCorrect' | 'itemsTotal'>, separator = ' / '): string {
  if (session.itemsTotal === null) return '—';
  return `${String(session.itemsCorrect ?? 0)}${separator}${String(session.itemsTotal)}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}
