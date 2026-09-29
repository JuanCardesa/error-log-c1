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
