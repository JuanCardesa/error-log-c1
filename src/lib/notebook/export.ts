import { slug as githubSlug } from 'github-slugger';
import { stringify } from 'yaml';

import { notebookLinkSpans } from './markdown';
import type { NotebookFolder, NotebookNote } from './types';
import { classifyNotebookUrl, parseNotebookNoteId } from './urls';

/**
 * Serialización de un apunte a `.md`. El cuerpo se conserva byte a byte: solo se le añade
 * el frontmatter que `import.ts` sabe volver a leer (title y tags se aplican; el UID y las
 * fechas se reconocen como ajenos y no se copian a un apunte nuevo).
 *
 * Los nombres de fichero llevan el ID, así que dos apuntes con el mismo título no chocan y
 * ninguno puede quedarse en un nombre reservado de Windows (CON, NUL, COM1…).
 */

/** Suficiente para reconocer el apunte sin acercarse al límite de ruta de Windows. */
const NOTE_SLUG_MAX = 60;
const FOLDER_SLUG_MAX = 40;

function shortSlug(title: string, max: number): string {
  // githubSlug ya quita `/ \ < > : " | ? *`; conserva acentos y otros alfabetos.
  return Array.from(githubSlug(title).replace(/^-+|-+$/gu, '')).slice(0, max).join('').replace(/-+$/u, '');
}

/** `42-past-modal-verbs.md`; solo `42.md` si el título no deja nada utilizable. */
export function notebookNoteFileName(note: Pick<NotebookNote, 'id' | 'title'>): string {
  const suffix = shortSlug(note.title, NOTE_SLUG_MAX);
  return `${String(note.id)}${suffix === '' ? '' : `-${suffix}`}.md`;
}

/** `grammar--1`: el ID va detrás para que el orden alfabético siga al nombre. */
export function notebookFolderDirName(folder: Pick<NotebookFolder, 'id' | 'name'>): string {
  const prefix = shortSlug(folder.name, FOLDER_SLUG_MAX);
  return prefix === '' ? String(folder.id) : `${prefix}--${String(folder.id)}`;
}

export interface NotebookFrontmatter {
  readonly title: string;
  readonly tags: readonly string[];
  readonly notebook_uid: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export function notebookFrontmatter(note: NotebookNote): NotebookFrontmatter {
  return {
    title: note.title,
    tags: [...note.tags],
    notebook_uid: note.uid,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

/**
 * Todo valor va entre comillas dobles y en una sola línea: así ningún título puede
 * escribir una línea `---` que al releer el archivo pareciera el cierre del frontmatter.
 */
export function notebookNoteToMarkdown(note: NotebookNote): string {
  const frontmatter = stringify(notebookFrontmatter(note), {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  return `---\n${frontmatter}---\n${note.contentMarkdown}`;
}

/** `nb-must-have` en el lector es `must-have` en GitHub: solo cae el prefijo propio. */
function githubFragment(fragment: string): string {
  return fragment.startsWith('nb-') ? fragment.slice(3) : fragment;
}

/** Ruta relativa entre dos ficheros del ZIP, siempre con `/`. */
function relativePath(fromPath: string, toPath: string): string {
  const from = fromPath.split('/').slice(0, -1);
  const to = toPath.split('/');
  const target = to.pop() ?? '';
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  const up = Array.from({ length: from.length - shared }, () => '..');
  const down = to.slice(shared);
  const steps = [...up, ...down, target];
  // Sin `./`, un nombre con dos puntos podría leerse como un esquema de URL.
  return up.length === 0 && down.length === 0 ? `./${target}` : steps.join('/');
}

export interface NotebookLinkRewrite {
  readonly markdown: string;
  /** Enlaces a otros apuntes que ahora apuntan a su fichero dentro del ZIP. */
  readonly rewritten: number;
  /** Enlaces a apuntes que no están en esta exportación: se dejan como estaban. */
  readonly unresolved: number;
}

/**
 * Deja el ZIP navegable: `/notebook/42-x#nb-must-have` pasa a `../grammar--1/42-x.md#must-have`.
 *
 * Solo toca el destino, nunca el resto del documento, y solo cuando puede situarlo con
 * exactitud. Markdown no estandariza las anclas, así que la convención de GitHub es una
 * elección, no una garantía de que todos los visores salten al mismo sitio.
 */
export function rewriteNotebookLinks(markdown: string, options: {
  readonly fromPath: string;
  readonly pathOf: (noteId: number) => string | undefined;
}): NotebookLinkRewrite {
  // Solo se reescriben destinos internos, y esos solo pueden venir de `[texto](destino)` o
  // de una definición `[ref]: destino`. Las URL sueltas y `<https://…>` son siempre externas.
  // Sin `](` ni `]:` no hay nada que tocar, y el ZIP se ahorra parsear casi todo el cuaderno.
  if (!markdown.includes('](') && !markdown.includes(']:')) return { markdown, rewritten: 0, unresolved: 0 };

  let unresolved = 0;
  const edits: Array<{ start: number; end: number; text: string }> = [];

  for (const span of notebookLinkSpans(markdown)) {
    const next = rewrittenDestination(span.url, options);
    if (next === 'unresolved') { unresolved += 1; continue; }
    if (next !== null && next !== span.url) edits.push({ start: span.start, end: span.end, text: next });
  }

  // De atrás hacia delante: cada sustitución conserva los offsets de las anteriores.
  let output = markdown;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
  }
  return { markdown: output, rewritten: edits.length, unresolved };
}

/** `null`: no es un destino que esta exportación deba tocar. */
function rewrittenDestination(url: string, options: {
  readonly fromPath: string;
  readonly pathOf: (noteId: number) => string | undefined;
}): string | 'unresolved' | null {
  const target = classifyNotebookUrl(url);
  if (target.kind !== 'internal') return null;
  if (target.href.startsWith('#')) return `#${githubFragment(target.href.slice(1))}`;

  const [pathname = '', hash = ''] = target.href.split('#', 2);
  const key = pathname.startsWith('/notebook/') ? pathname.slice('/notebook/'.length) : '';
  const noteId = key === '' ? null : parseNotebookNoteId(key);
  if (noteId === null) return null;
  const to = options.pathOf(noteId);
  if (to === undefined) return 'unresolved';
  return `${relativePath(options.fromPath, to)}${hash === '' ? '' : `#${githubFragment(hash)}`}`;
}
