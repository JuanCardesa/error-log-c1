/**
 * Serializador CSV conforme a RFC 4180.
 *
 * Se escribe a mano en vez de tirar de libreria porque son treinta lineas y el escapado
 * de comillas es exactamente el detalle que hay que poder testear.
 */

export type CsvValue = string | number | boolean | null | undefined;

const NEEDS_QUOTING = /["\n\r,]/;

/** RFC 4180: el separador de linea es CRLF, que es ademas lo que espera Excel. */
const EOL = '\r\n';

export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  if (!NEEDS_QUOTING.test(text)) return text;

  // Una comilla dentro del campo se duplica, y el campo entero se entrecomilla.
  return `"${text.split('"').join('""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join(EOL) + EOL;
}
