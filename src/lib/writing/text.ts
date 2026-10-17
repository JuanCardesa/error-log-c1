/**
 * El texto de una redacción, tal como se escribió. Aquí solo se lee: párrafos, palabras y
 * parecido entre dos transcripciones. Sin dependencias de servidor: el lector también
 * cuenta palabras.
 */

/** Lo único que se toca: los saltos de Windows y los blancos del principio y del final. */
export function normalizeWritingText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export interface Paragraph {
  /** Desde 1, como lo cuenta una persona y como llega en el contrato JSON. */
  readonly number: number;
  readonly start: number;
  readonly end: number;
}

/** Una línea en blanco (o varias) separa párrafos; un salto simple queda dentro del párrafo. */
const PARAGRAPH_BREAK = /\n[^\S\n]*\n\s*/g;

export function paragraphsOf(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let start = 0;
  const push = (end: number) => {
    if (end > start) paragraphs.push({ number: paragraphs.length + 1, start, end });
  };
  for (const match of text.matchAll(PARAGRAPH_BREAK)) {
    push(match.index);
    start = match.index + match[0].length;
  }
  push(text.length);
  return paragraphs;
}

/**
 * Una palabra es una secuencia de letras o cifras; un apóstrofo o un guion entre ellas no la
 * parte (don't, well-known), ni el punto o la coma de un número (2.5, 1,000).
 */
const WORD = /[\p{L}\p{N}]+(?:(?:['’\-‐]|(?<=\p{N})[.,](?=\p{N}))[\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function wordSet(text: string): Set<string> {
  return new Set((text.toLowerCase().replace(/’/g, '\'').match(WORD) ?? []));
}

/**
 * Proporción de palabras distintas que comparten dos textos (Jaccard). Dos transcripciones
 * del mismo papel se parecen mucho aunque difieran en una coma o en una palabra mal leída.
 */
export function textSimilarity(a: string, b: string): number {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}
