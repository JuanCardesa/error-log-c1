import { asc, eq } from 'drizzle-orm';

import {
  notebookFolderDirName, notebookNoteFileName, notebookNoteToMarkdown, rewriteNotebookLinks,
} from '../notebook/export';
import type { NotebookErrorLink, NotebookFolder, NotebookNote } from '../notebook/types';
import type { Db } from './client';
import { notebookErrorLink, notebookFolder, notebookNote } from './schema';

/**
 * Exportación del cuaderno. Se lee de una copia consistente de la base, nunca de la base
 * viva: así ningún apunte sale con una revisión y el cuerpo de otra.
 *
 * Los cuerpos se leen de uno en uno, cuando el ZIP o el JSON los piden. Las rutas se
 * calculan antes, porque reescribir un enlace exige conocer el destino de todos.
 */

/** Carpeta raíz dentro del ZIP: descomprimirlo no ensucia el directorio de destino. */
export const NOTEBOOK_ZIP_ROOT = 'Notebook';
export const NOTEBOOK_MANIFEST_VERSION = 2;

export interface NotebookExportPaths {
  /** Ruta de cada carpeta dentro de `Notebook/`, por ID. */
  readonly folders: ReadonlyMap<number, string>;
  /** Ruta del `.md` de cada apunte dentro de `Notebook/`, por ID. */
  readonly notes: ReadonlyMap<number, string>;
}

/** Metadatos de un apunte sin su cuerpo: el índice cabe en memoria, los cuerpos no. */
type NoteHeader = Omit<NotebookNote, 'contentMarkdown'>;

const noteHeaderColumns = {
  id: notebookNote.id,
  uid: notebookNote.uid,
  folderId: notebookNote.folderId,
  title: notebookNote.title,
  tags: notebookNote.tags,
  revision: notebookNote.revision,
  createdAt: notebookNote.createdAt,
  updatedAt: notebookNote.updatedAt,
};

export function listNotebookExportFolders(db: Db): NotebookFolder[] {
  return db.select().from(notebookFolder)
    .orderBy(asc(notebookFolder.parentId), asc(notebookFolder.nameKey), asc(notebookFolder.id)).all();
}

export function listNotebookExportNoteHeaders(db: Db): NoteHeader[] {
  return db.select(noteHeaderColumns).from(notebookNote).orderBy(asc(notebookNote.id)).all();
}

export function listNotebookExportErrorLinks(db: Db): NotebookErrorLink[] {
  return db.select().from(notebookErrorLink)
    .orderBy(asc(notebookErrorLink.noteId), asc(notebookErrorLink.errorId)).all();
}

/** Un cuerpo cada vez: son hasta 256 KiB por apunte. */
function noteBody(db: Db, id: number): string {
  const row = db.select({ contentMarkdown: notebookNote.contentMarkdown }).from(notebookNote)
    .where(eq(notebookNote.id, id)).get();
  return row?.contentMarkdown ?? '';
}

/**
 * Rutas de todo el cuaderno. Una carpeta hija cuelga de su madre; el ID en cada nombre
 * evita que dos títulos o dos carpetas iguales compartan ruta.
 */
export function notebookExportPaths(folders: readonly NotebookFolder[], notes: readonly NoteHeader[]): NotebookExportPaths {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const folderPaths = new Map<number, string>();
  for (const folder of folders) {
    const own = notebookFolderDirName(folder);
    const parent = folder.parentId === null ? undefined : byId.get(folder.parentId);
    folderPaths.set(folder.id, parent === undefined ? own : `${notebookFolderDirName(parent)}/${own}`);
  }
  const notePaths = new Map<number, string>();
  for (const note of notes) {
    const directory = note.folderId === null ? undefined : folderPaths.get(note.folderId);
    const file = notebookNoteFileName(note);
    notePaths.set(note.id, directory === undefined ? file : `${directory}/${file}`);
  }
  return { folders: folderPaths, notes: notePaths };
}

export interface NotebookManifestNote {
  readonly id: number;
  readonly uid: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly folderId: number | null;
  readonly path: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotebookManifest {
  readonly formatVersion: number;
  readonly exportedAt: string;
  readonly folders: ReadonlyArray<{
    readonly id: number;
    readonly parentId: number | null;
    readonly name: string;
    readonly path: string;
  }>;
  readonly notes: readonly NotebookManifestNote[];
  /**
   * Los vínculos con errores viajan aquí y no en los `.md`: identifican filas de esta base
   * y no se pueden emparejar con los IDs de otra. El ZIP no los restaura.
   */
  readonly errorLinks: readonly NotebookErrorLink[];
}

export function notebookManifest(db: Db, now: Date): NotebookManifest {
  const folders = listNotebookExportFolders(db);
  const notes = listNotebookExportNoteHeaders(db);
  const paths = notebookExportPaths(folders, notes);
  return {
    formatVersion: NOTEBOOK_MANIFEST_VERSION,
    exportedAt: now.toISOString(),
    folders: folders.map((folder) => ({
      id: folder.id, parentId: folder.parentId, name: folder.name,
      path: paths.folders.get(folder.id) ?? '',
    })),
    notes: notes.map((note) => ({
      id: note.id, uid: note.uid, title: note.title, tags: note.tags, folderId: note.folderId,
      path: paths.notes.get(note.id) ?? '', revision: note.revision,
      createdAt: note.createdAt, updatedAt: note.updatedAt,
    })),
    errorLinks: listNotebookExportErrorLinks(db),
  };
}

interface ZipEntryBase {
  /** Ruta completa dentro del ZIP, ya con `Notebook/` delante. */
  readonly path: string;
  readonly mtime: Date;
}

/** Una carpeta no tiene contenido que leer; un fichero se lee cuando el ZIP llega a él. */
export type NotebookZipEntry =
  | (ZipEntryBase & { readonly kind: 'directory' })
  | (ZipEntryBase & { readonly kind: 'note' | 'manifest'; readonly read: () => string });

/**
 * Entradas del ZIP en orden. Las carpetas van explícitas para que una carpeta vacía
 * también se exporte, y el manifiesto al final, cuando ya se conocen todas las rutas.
 */
export function notebookZipEntries(db: Db, now: Date): NotebookZipEntry[] {
  const folders = listNotebookExportFolders(db);
  const notes = listNotebookExportNoteHeaders(db);
  const paths = notebookExportPaths(folders, notes);
  const pathOf = (id: number) => paths.notes.get(id);

  const entries: NotebookZipEntry[] = folders.map((folder) => ({
    path: `${NOTEBOOK_ZIP_ROOT}/${paths.folders.get(folder.id) ?? ''}`,
    kind: 'directory' as const,
    mtime: new Date(folder.updatedAt),
  }));

  for (const note of notes) {
    const fromPath = paths.notes.get(note.id) ?? notebookNoteFileName(note);
    entries.push({
      path: `${NOTEBOOK_ZIP_ROOT}/${fromPath}`,
      kind: 'note',
      mtime: new Date(note.updatedAt),
      read: () => {
        const body = rewriteNotebookLinks(noteBody(db, note.id), { fromPath, pathOf }).markdown;
        return notebookNoteToMarkdown({ ...note, contentMarkdown: body });
      },
    });
  }

  entries.push({
    path: `${NOTEBOOK_ZIP_ROOT}/manifest.json`,
    kind: 'manifest',
    mtime: now,
    read: () => `${JSON.stringify(notebookManifest(db, now), null, 2)}\n`,
  });
  return entries;
}

/**
 * Volcado JSON completo por trozos. `rows` y `anki` salen de una vez, como siempre; lo que
 * se emite apunte a apunte son los cuerpos del cuaderno, que son lo que puede crecer.
 */
export function* notebookDumpChunks(db: Db, head: object): Generator<string> {
  const serialized = JSON.stringify(head);
  // El objeto de cabecera nunca está vacío, así que se le puede colgar otra clave.
  yield `${serialized.slice(0, -1)},"notebook":`;
  yield* notebookJsonChunks(db);
  yield '}';
}

/**
 * Colecciones Notebook del volcado JSON, emitidas por trozos: los cuerpos no se juntan
 * nunca en un solo objeto en memoria.
 */
export function* notebookJsonChunks(db: Db): Generator<string> {
  const folders = listNotebookExportFolders(db);
  const notes = listNotebookExportNoteHeaders(db);
  yield `{"folders":${JSON.stringify(folders)},"notes":[`;
  let first = true;
  for (const note of notes) {
    yield `${first ? '' : ','}${JSON.stringify({ ...note, contentMarkdown: noteBody(db, note.id) })}`;
    first = false;
  }
  yield `],"errorLinks":${JSON.stringify(listNotebookExportErrorLinks(db))}}`;
}
