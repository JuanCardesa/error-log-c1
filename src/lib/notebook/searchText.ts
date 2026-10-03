/**
 * Texto de búsqueda sin parser de Markdown. Vive aparte de `markdown.ts` porque aquello
 * importa unified, remark y GFM al cargarse: un componente de cliente que solo necesitara
 * normalizar una consulta se llevaría el parser entero al navegador.
 */

/** Compartido por FTS y por la normalización de la consulta. */
export function normalizeNotebookSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ]/gu, "'")
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface NotebookTextMatch {
  readonly start: number;
  readonly end: number;
}

/** Devuelve offsets del texto original aunque la consulta omita acentos o cambie de caja. */
export function findNotebookTextMatch(value: string, query: string): NotebookTextMatch | null {
  const needle = normalizeNotebookSearchText(query);
  if (needle === '') return null;
  const position = normalizeNotebookSearchText(value).indexOf(needle);
  if (position < 0) return null;

  let normalizedOffset = 0;
  let originalOffset = 0;
  let previousSpace = false;
  let start = -1;
  let end = -1;
  for (const character of value) {
    const originalEnd = originalOffset + character.length;
    let piece: string;
    if (/\s/u.test(character)) {
      piece = normalizedOffset > 0 && !previousSpace ? ' ' : '';
      previousSpace = true;
    } else {
      // En ASCII normalizar solo cambia la caja: se ahorra la normalización Unicode
      // carácter a carácter, que era lo que encarecía un acierto lejos del principio.
      piece = character.charCodeAt(0) < 0x80 ? character.toLowerCase() : normalizeNotebookSearchText(character);
      if (piece !== '') previousSpace = false;
    }
    if (piece !== '') {
      const nextOffset = normalizedOffset + piece.length;
      if (start < 0 && position >= normalizedOffset && position < nextOffset) start = originalOffset;
      if (position + needle.length - 1 >= normalizedOffset && position + needle.length - 1 < nextOffset) {
        end = originalEnd;
        break;
      }
      normalizedOffset = nextOffset;
    }
    originalOffset = originalEnd;
  }
  return start < 0 || end < 0 ? null : { start, end };
}
