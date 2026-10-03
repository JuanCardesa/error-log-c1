import GithubSlugger, { slug as githubSlug } from 'github-slugger';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { findNotebookTextMatch, normalizeNotebookSearchText, type NotebookTextMatch } from './searchText';
import type { NotebookHeading, NotebookMarkdownLink } from './types';

// El servidor las sigue importando de aquí; el cliente, de `searchText`, sin el parser.
export { findNotebookTextMatch, normalizeNotebookSearchText, type NotebookTextMatch };

const parser = unified().use(remarkParse).use(remarkGfm);
const blockTypes = new Set([
  'blockquote', 'code', 'footnoteDefinition', 'heading', 'list', 'listItem',
  'paragraph', 'root', 'table', 'tableCell', 'tableRow', 'thematicBreak',
]);

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

/** Slugs en orden de documento: cada uno depende solo de los encabezados anteriores. */
function treeHeadings(tree: Root): { headings: NotebookHeading[]; offsets: number[] } {
  const slugger = new GithubSlugger();
  const headings: NotebookHeading[] = [];
  const offsets: number[] = [];
  walk(tree, (node) => {
    if (node.type !== 'heading') return;
    const text = visibleText(node).trim();
    const fallback = `section-${String(headings.length + 1)}`;
    const base = githubSlug(text);
    const slug = `nb-${slugger.slug(base.replace(/-/gu, '') ? text : fallback)}`;
    headings.push({ depth: node.depth, text, slug });
    offsets.push(node.position?.start.offset ?? -1);
  });
  return { headings, offsets };
}

function analyzeTree(tree: Root): NotebookMarkdownAnalysis {
  const links: NotebookMarkdownLink[] = [];
  const definitions = new Map<string, string>();

  walk(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    }
  });

  walk(tree, (node) => {
    if (node.type === 'link') {
      links.push({ text: visibleText(node), url: node.url });
    } else if (node.type === 'linkReference') {
      const url = definitions.get(node.identifier);
      if (url !== undefined) links.push({ text: visibleText(node), url });
    }
  });

  const { headings, offsets } = treeHeadings(tree);
  return {
    headings,
    headingOffsets: offsets,
    searchText: normalizeNotebookSearchText(visibleText(tree)),
    links,
  };
}

export interface NotebookExcerpt {
  readonly text: string;
  readonly match: NotebookTextMatch;
  readonly heading: NotebookHeading | null;
}

/** Caracteres de contexto a cada lado del acierto. */
const EXCERPT_BEFORE = 70;
const EXCERPT_AFTER = 110;

export interface NotebookExcerptOptions {
  /** Por debajo de este tamaño se parsea el apunte entero: cortarlo no compensa. */
  readonly wholeBelow?: number;
  /** Markdown que se deja pasar tras el acierto antes de cortar en una línea en blanco. */
  readonly margin?: number;
}

/**
 * Solo se invoca para los resultados de la página visible, nunca para todo el cuaderno.
 *
 * Parsear es lo caro: un apunte de 100 KiB cuesta decenas de milisegundos, y una página de
 * resultados puede traer veinte. Por eso, en los apuntes largos se intenta primero con el
 * Markdown hasta un poco después del primer acierto, y ese resultado solo se acepta si es
 * idéntico al del documento entero; si no se puede asegurar, se parsea entero, como antes.
 */
export function findNotebookMarkdownExcerpt(
  markdown: string,
  query: string,
  { wholeBelow = 2 * 1024, margin = 512 }: NotebookExcerptOptions = {},
): NotebookExcerpt | null {
  if (normalizeNotebookSearchText(query) === '') return null;
  if (markdown.length >= wholeBelow) {
    const partial = excerptFromPrefix(markdown, query, margin);
    if (partial !== undefined) return partial;
  }
  return excerptFromTree(parser.parse(markdown) as Root, query, false) ?? null;
}

/**
 * Un corte en una línea en blanco solo puede partir el último bloque de primer nivel: el
 * subrayado de un encabezado setext y la fila delimitadora de una tabla van pegados a su
 * línea, y lo que sigue a una línea en blanco no cambia los bloques ya cerrados. Todos los
 * bloques anteriores salen igual que en el documento entero, con sus slugs.
 *
 * La excepción son las definiciones (`[ref]: url`, `[^nota]: …`): convierten en enlace un
 * texto anterior, así que con cualquier cosa que se les parezca se parsea entero.
 *
 * `undefined` significa «con este trozo no se puede decidir».
 */
function excerptFromPrefix(markdown: string, query: string, margin: number): NotebookExcerpt | null | undefined {
  if (markdown.includes(']:')) return undefined;
  // El primer acierto en el Markdown crudo marca hasta dónde leer. Si el formato parte la
  // frase (`must **have**`) no aparece así, y se recurre al documento entero.
  const raw = findNotebookTextMatch(markdown, query);
  if (raw === null) return undefined;
  const blank = /\n[ \t\r]*\n/gu;
  blank.lastIndex = raw.end + margin;
  const cut = blank.exec(markdown);
  if (cut === null) return undefined;
  return excerptFromTree(parser.parse(markdown.slice(0, cut.index + cut[0].length)) as Root, query, true);
}

interface Segment {
  readonly text: string;
  readonly heading: NotebookHeading | null;
}

/**
 * Con `partial`, el árbol es de un trozo: su último bloque de primer nivel puede estar
 * cortado y no cuenta, y el contexto tras el acierto tiene que caber en lo que sí cuenta.
 */
function excerptFromTree(tree: Root, query: string, partial: boolean): NotebookExcerpt | null | undefined {
  const { headings } = treeHeadings(tree);
  const segments: Segment[] = [];
  let currentHeading: NotebookHeading | null = null;
  let headingIndex = 0;
  const complete = partial ? tree.children.length - 1 : tree.children.length;
  tree.children.forEach((block, index) => {
    walk(block, (node) => {
      if (node.type === 'heading') currentHeading = headings[headingIndex++] ?? null;
      if (index >= complete) return;
      if (node.type === 'heading' || node.type === 'paragraph' || node.type === 'code' || node.type === 'tableCell') {
        const text = visibleText(node).trim();
        if (text !== '') segments.push({ text, heading: currentHeading });
      }
    });
  });
  const plainText = segments.map((segment) => segment.text).join(' ');
  const match = findNotebookTextMatch(plainText, query);
  if (match === null) return partial ? undefined : null;
  // Estrictamente menor: con el texto justo, no se sabría si el original sigue (`…`).
  if (partial && match.end + EXCERPT_AFTER >= plainText.length) return undefined;
  let segmentEnd = 0;
  let heading: NotebookHeading | null = null;
  for (const segment of segments) {
    segmentEnd += segment.text.length;
    if (match.start <= segmentEnd) { heading = segment.heading; break; }
    segmentEnd += 1;
  }
  const start = Math.max(0, match.start - EXCERPT_BEFORE);
  const end = Math.min(plainText.length, match.end + EXCERPT_AFTER);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plainText.length ? '…' : '';
  return {
    text: `${prefix}${plainText.slice(start, end)}${suffix}`,
    match: { start: prefix.length + match.start - start, end: prefix.length + match.end - start },
    heading,
  };
}
