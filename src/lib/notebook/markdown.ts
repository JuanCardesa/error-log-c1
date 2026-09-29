import GithubSlugger, { slug as githubSlug } from 'github-slugger';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { NotebookHeading, NotebookMarkdownLink } from './types';

const parser = unified().use(remarkParse).use(remarkGfm);
const blockTypes = new Set([
  'blockquote', 'code', 'footnoteDefinition', 'heading', 'list', 'listItem',
  'paragraph', 'root', 'table', 'tableCell', 'tableRow', 'thematicBreak',
]);

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

function visibleText(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value;
    case 'image':
    case 'imageReference':
      return node.alt ?? '';
    case 'break':
      return ' ';
    case 'html':
    case 'definition':
      return '';
    default: {
      if (!('children' in node)) return '';
      const content = node.children.map((child) => visibleText(child)).join('');
      return blockTypes.has(node.type) ? `${content}\n` : content;
    }
  }
}

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ('children' in node) node.children.forEach((child) => walk(child, visit));
}

export interface NotebookLinkSpan {
  readonly url: string;
  /** Offsets del destino dentro del Markdown original, sin el texto ni los paréntesis. */
  readonly start: number;
  readonly end: number;
}

/**
 * Localiza el destino de cada enlace para poder sustituirlo sin reescribir el documento.
 *
 * Solo devuelve un tramo cuando el texto de esas posiciones coincide exactamente con la URL
 * que leyó el parser. Una forma que no se pueda situar así se omite: la exportación
 * preferirá dejar el enlace como estaba antes que arriesgarse a cortar el Markdown.
 */
export function notebookLinkSpans(markdown: string): NotebookLinkSpan[] {
  const spans: NotebookLinkSpan[] = [];
  walk(parser.parse(markdown) as Root, (node) => {
    if (node.type !== 'link' && node.type !== 'definition') return;
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) return;
    const span = destinationSpan(markdown.slice(from, to), node.type, node.url);
    if (span === null) return;
    const start = from + span.start;
    const end = from + span.end;
    if (markdown.slice(start, end) === node.url) spans.push({ url: node.url, start, end });
  });
  return spans;
}

/** Offsets dentro del trozo de Markdown que ocupa el nodo. */
function destinationSpan(slice: string, type: 'link' | 'definition', url: string): { start: number; end: number } | null {
  if (type === 'definition') {
    const label = slice.indexOf(']:');
    return label < 0 ? null : bareDestination(slice, label + 2);
  }
  // `<https://…>` y las URL sueltas que reconoce GFM no llevan texto ni paréntesis.
  if (slice.startsWith('<') && slice.endsWith('>')) return { start: 1, end: slice.length - 1 };
  if (slice === url) return { start: 0, end: slice.length };
  const open = slice.lastIndexOf('](');
  return open < 0 ? null : bareDestination(slice, open + 2);
}

/** Desde `at`: entre `<>`, o hasta el espacio que separa el título o el cierre del enlace. */
function bareDestination(slice: string, at: number): { start: number; end: number } | null {
  let start = at;
  while (start < slice.length && (slice[start] === ' ' || slice[start] === '\t')) start += 1;
  if (slice[start] === '<') {
    const close = slice.indexOf('>', start);
    return close < 0 ? null : { start: start + 1, end: close };
  }
  let end = start;
  while (end < slice.length && !/[\s)]/u.test(slice[end] ?? '')) end += 1;
  return end === start ? null : { start, end };
}

export interface NotebookMarkdownAnalysis {
  readonly headings: readonly NotebookHeading[];
  /** Posición de cada encabezado, alineada con `headings`, para el renderizador. */
  readonly headingOffsets: readonly number[];
  readonly searchText: string;
  readonly links: readonly NotebookMarkdownLink[];
}

/** Parsear una sola vez antes de escribir; el lector usa los mismos slugs. */
export function analyzeNotebookMarkdown(markdown: string): NotebookMarkdownAnalysis {
  const tree = parser.parse(markdown) as Root;
  return analyzeTree(tree);
}

export interface NotebookMarkdownInspection extends NotebookMarkdownAnalysis {
  /** Bloques y fragmentos HTML, comentarios incluidos: el lector los omite. */
  readonly htmlCount: number;
  /** Imágenes que el lector muestra como texto, sin pedirlas. */
  readonly imageCount: number;
}

/** Para avisar antes de importar; un solo parseo con la misma política que el lector. */
export function inspectNotebookMarkdown(markdown: string): NotebookMarkdownInspection {
  const tree = parser.parse(markdown) as Root;
  let htmlCount = 0;
  let imageCount = 0;
  walk(tree, (node) => {
    if (node.type === 'html') htmlCount += 1;
    else if (node.type === 'image' || node.type === 'imageReference') imageCount += 1;
  });
  return { ...analyzeTree(tree), htmlCount, imageCount };
}

function analyzeTree(tree: Root): NotebookMarkdownAnalysis {
  const slugger = new GithubSlugger();
  const headings: NotebookHeading[] = [];
  const headingOffsets: number[] = [];
  const links: NotebookMarkdownLink[] = [];
  const definitions = new Map<string, string>();

  walk(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    }
  });

  walk(tree, (node) => {
    if (node.type === 'heading') {
      const text = visibleText(node).trim();
      const fallback = `section-${String(headings.length + 1)}`;
      const base = githubSlug(text);
      const slug = `nb-${slugger.slug(base.replace(/-/gu, '') ? text : fallback)}`;
      headings.push({ depth: node.depth, text, slug });
      headingOffsets.push(node.position?.start.offset ?? -1);
    } else if (node.type === 'link') {
      links.push({ text: visibleText(node), url: node.url });
    } else if (node.type === 'linkReference') {
      const url = definitions.get(node.identifier);
      if (url !== undefined) links.push({ text: visibleText(node), url });
    }
  });

  return {
    headings,
    headingOffsets,
    searchText: normalizeNotebookSearchText(visibleText(tree)),
    links,
  };
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
      piece = normalizeNotebookSearchText(character);
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

export interface NotebookExcerpt {
  readonly text: string;
  readonly match: NotebookTextMatch;
  readonly heading: NotebookHeading | null;
}

/** Solo se invoca para los resultados de la página visible, nunca para todo el cuaderno. */
export function findNotebookMarkdownExcerpt(markdown: string, query: string): NotebookExcerpt | null {
  if (normalizeNotebookSearchText(query) === '') return null;
  const tree = parser.parse(markdown) as Root;
  const headings = analyzeTree(tree).headings;
  const segments: Array<{ text: string; heading: NotebookHeading | null }> = [];
  let currentHeading: NotebookHeading | null = null;
  let headingIndex = 0;
  walk(tree, (node) => {
    if (node.type === 'heading') currentHeading = headings[headingIndex++] ?? null;
    if (node.type === 'heading' || node.type === 'paragraph' || node.type === 'code' || node.type === 'tableCell') {
      const text = visibleText(node).trim();
      if (text !== '') segments.push({ text, heading: currentHeading });
    }
  });
  const plainText = segments.map((segment) => segment.text).join(' ');
  const match = findNotebookTextMatch(plainText, query);
  if (match === null) return null;
  let segmentEnd = 0;
  let heading: NotebookHeading | null = null;
  for (const segment of segments) {
    segmentEnd += segment.text.length;
    if (match.start <= segmentEnd) { heading = segment.heading; break; }
    segmentEnd += 1;
  }
  const start = Math.max(0, match.start - 70);
  const end = Math.min(plainText.length, match.end + 110);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plainText.length ? '…' : '';
  return {
    text: `${prefix}${plainText.slice(start, end)}${suffix}`,
    match: { start: prefix.length + match.start - start, end: prefix.length + match.end - start },
    heading,
  };
}
