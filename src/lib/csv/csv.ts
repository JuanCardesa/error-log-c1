/**
 * Serializador CSV conforme a RFC 4180.
 *
 * Se escribe a mano en vez de tirar de libreria porque son treinta lineas y el escapado
 * de comillas es exactamente el detalle que hay que poder testear.
 */

export type CsvValue = string | number | boolean | null | undefined;

const NEEDS_QUOTING = /["\n\r,\t]/;

/** Los tres prefijos que Excel y LibreOffice evaluan siempre, tambien en ancho completo. */
const FORMULA_START = /^[\s﻿]*[=+@＝＋＠]/u;

/**
 * El guion tambien abre formula, pero `-ing`, `-ed` o `-ly` son respuestas corrientes en un
 * registro de ingles: protegerlas todas ensucia la exportacion habitual. Tras el guion se
 * admite texto llano (letras, cifras y la puntuacion que aparece en las respuestas, `-ing/-ed`
 * incluido) y se protege el resto: `-2+3` por aritmetica y `-cmd|'/c ...'!A0` de DDE, que
 * necesita la barra vertical.
 */
const DASH_START = /^[\s﻿]*[-－]/u;
const PLAIN_TEXT = /^[\p{L}\p{M}\p{N}\p{Zs}\s'’´`.,;:()[\]{}?!¿¡"«»&#%_/-]*$/u;

function opensFormula(text: string): boolean {
  return FORMULA_START.test(text) || (DASH_START.test(text) && !PLAIN_TEXT.test(text));
}

/** RFC 4180: el separador de linea es CRLF, que es ademas lo que espera Excel. */
const EOL = '\r\n';

export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  const raw = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  // Los CSV se abren en hojas de calculo. Un tabulador dentro del campo entrecomillado
  // hace que Excel lea como texto una respuesta con aspecto de formula.
  // El JSON conserva el valor original; los numeros siguen siendo numeros.
  const text = typeof value === 'string' && opensFormula(raw) ? `\t${raw}` : raw;

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
