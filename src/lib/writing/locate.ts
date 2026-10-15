import { paragraphsOf } from './text';

/**
 * Dónde está, dentro del texto, el fragmento que cita una anotación importada.
 *
 * Una IA copia bien un fragmento pero no cuenta caracteres, así que se recibe una cita y
 * se busca. Solo se coloca cuando queda exactamente una posición posible: con varias, o
 * si el número de aparición o el contexto contradicen lo encontrado, la anotación se queda
 * sin colocar y se elige a mano. Nunca se ancla por aproximación a la palabra equivocada.
 */

export interface QuoteTarget {
  readonly quote: string;
  /** Desde 1. Limita la búsqueda a ese párrafo. */
  readonly paragraph: number | null;
  /** Desde 1: qué aparición de la cita, dentro del párrafo si lo hay. */
  readonly occurrence: number | null;
  readonly before: string | null;
  readonly after: string | null;
  /** Solo en exportaciones de Error-Log: se usan si siguen señalando la misma cita. */
  readonly start: number | null;
  readonly end: number | null;
}

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export type QuoteLocation =
  | { readonly status: 'placed'; readonly start: number; readonly end: number; readonly loose: boolean }
  | {
    readonly status: 'ambiguous';
    /** Varias apariciones posibles, o una que no encaja con la aparición o el contexto pedidos. */
    readonly reason: 'several' | 'contradicts';
    readonly candidates: readonly TextRange[];
    readonly loose: boolean;
  }
  | { readonly status: 'notFound' };

const isWordChar = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** «it» no puede encajar dentro de «city»: una cita no empieza ni acaba a mitad de palabra. */
function atWordEdges(text: string, { start, end }: TextRange): boolean {
  if (isWordChar(text[start]) && isWordChar(text[start - 1])) return false;
  return !(isWordChar(text[end - 1]) && isWordChar(text[end]));
}

const UNIFY: Readonly<Record<string, string>> = {
  '’': '\'', '‘': '\'', 'ʼ': '\'', '“': '"', '”': '"', '–': '-', '—': '-', '‐': '-', '‑': '-',
};

interface Comparable {
  readonly value: string;
  /** Para cada carácter de `value`, dónde empieza y acaba lo que representa en el original. */
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

/** Sin distinguir blancos repetidos, comillas tipográficas, guiones ni mayúsculas. */
function comparable(text: string, from = 0, to = text.length): Comparable {
  let value = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = from;
  while (index < to) {
    const char = text[index] ?? '';
    if (/\s/.test(char)) {
      let next = index + 1;
      while (next < to && /\s/.test(text[next] ?? '')) next += 1;
      value += ' ';
      starts.push(index);
      ends.push(next);
      index = next;
      continue;
    }
    const unified = UNIFY[char] ?? char;
    const lower = unified.toLowerCase();
    // Algunas minúsculas ocupan dos unidades: entonces se compara tal cual, sin perder el mapa.
    value += lower.length === unified.length ? lower : unified;
    starts.push(index);
    ends.push(index + 1);
    index += 1;
  }
  return { value, starts, ends };
}

function exactMatches(text: string, quote: string, scope: TextRange): TextRange[] {
  const found: TextRange[] = [];
  for (let at = text.indexOf(quote, scope.start); at !== -1 && at + quote.length <= scope.end; at = text.indexOf(quote, at + 1)) {
    const range = { start: at, end: at + quote.length };
    if (atWordEdges(text, range)) found.push(range);
  }
  return found;
}

function looseMatches(text: string, quote: string, scope: TextRange): TextRange[] {
  const haystack = comparable(text, scope.start, scope.end);
  const needle = comparable(quote).value.trim();
  if (needle === '') return [];
  const found: TextRange[] = [];
  for (let at = haystack.value.indexOf(needle); at !== -1; at = haystack.value.indexOf(needle, at + 1)) {
    const start = haystack.starts[at];
    const end = haystack.ends[at + needle.length - 1];
    if (start === undefined || end === undefined) continue;
    const range = { start, end };
    if (atWordEdges(text, range)) found.push(range);
  }
  return found;
}

/** El contexto se compara con la misma tolerancia que la cita aproximada. */
function contextFits(text: string, range: TextRange, before: string | null, after: string | null): boolean {
  if (before !== null) {
    const want = comparable(before).value.trim();
    // Holgura: el texto puede tener más blancos seguidos que el contexto citado.
    const from = Math.max(0, range.start - 2 * before.length - 20);
    if (want !== '' && !comparable(text, from, range.start).value.trimEnd().endsWith(want)) return false;
  }
  if (after !== null) {
    const want = comparable(after).value.trim();
    const to = Math.min(text.length, range.end + 2 * after.length + 20);
    if (want !== '' && !comparable(text, range.end, to).value.trimStart().startsWith(want)) return false;
  }
  return true;
}

export function locateQuote(text: string, target: QuoteTarget): QuoteLocation {
  const { quote } = target;
  if (target.start !== null && target.end !== null && text.slice(target.start, target.end) === quote) {
    return { status: 'placed', start: target.start, end: target.end, loose: false };
  }
  const scope = target.paragraph === null ? { start: 0, end: text.length } : paragraphsOf(text)[target.paragraph - 1];
  if (scope === undefined) return { status: 'notFound' };

  let loose = false;
  let candidates = exactMatches(text, quote, scope);
  if (candidates.length === 0) {
    candidates = looseMatches(text, quote, scope);
    loose = true;
  }
  if (candidates.length === 0) return { status: 'notFound' };

  const fits = (range: TextRange) => contextFits(text, range, target.before, target.after);
  if (target.occurrence !== null) {
    const chosen = candidates[target.occurrence - 1];
    if (chosen === undefined || !fits(chosen)) return { status: 'ambiguous', reason: 'contradicts', candidates, loose };
    return { status: 'placed', ...chosen, loose };
  }
  const fitting = candidates.filter(fits);
  const [only] = fitting;
  if (fitting.length === 1 && only !== undefined) return { status: 'placed', ...only, loose };
  if (fitting.length === 0) return { status: 'ambiguous', reason: 'contradicts', candidates, loose };
  return { status: 'ambiguous', reason: 'several', candidates: fitting, loose };
}
