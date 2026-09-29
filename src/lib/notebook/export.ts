import { slug as githubSlug } from 'github-slugger';
import { stringify } from 'yaml';

import type { NotebookFolder, NotebookNote } from './types';

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
  return githubSlug(title).replace(/^-+|-+$/gu, '').slice(0, max).replace(/-+$/u, '');
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
