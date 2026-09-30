import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import { analyzeNotebookMarkdown, normalizeNotebookSearchText } from '../notebook/markdown';
import {
  createNotebookFolderSchema,
  createNotebookNoteSchema,
  deleteNotebookFolderSchema,
  deleteNotebookNoteSchema,
  normalizeFolderNameKey,
  saveNotebookNoteSchema,
  updateNotebookFolderSchema,
  type CreateNotebookFolderInput,
  type CreateNotebookNoteInput,
  type DeleteNotebookNoteInput,
  type SaveNotebookNoteInput,
  type UpdateNotebookFolderInput,
} from '../notebook/schemas';
import type {
  NotebookErrorCode, NotebookFolder, NotebookNote, NotebookNoteSummary, NotebookPage,
} from '../notebook/types';
import type { Db } from './client';
import { notebookFolder, notebookNote } from './schema';

/** Errores esperados de dominio; las acciones los convierten en respuestas tipadas. */
export class NotebookRepoError extends Error {
  constructor(readonly code: NotebookErrorCode, message: string, readonly current?: NotebookNote) {
    super(message);
    this.name = 'NotebookRepoError';
  }
}

const noteSummary = {
  id: notebookNote.id,
  uid: notebookNote.uid,
  folderId: notebookNote.folderId,
  title: notebookNote.title,
  tags: notebookNote.tags,
  revision: notebookNote.revision,
  createdAt: notebookNote.createdAt,
  updatedAt: notebookNote.updatedAt,
};

export function listNotebookFolders(db: Db): NotebookFolder[] {
  return db.select().from(notebookFolder)
    .orderBy(asc(notebookFolder.parentId), asc(notebookFolder.nameKey), asc(notebookFolder.id))
    .all();
}

export function getNotebookFolder(db: Db, id: number): NotebookFolder | null {
  return db.select().from(notebookFolder).where(eq(notebookFolder.id, id)).get() ?? null;
}

export function createNotebookFolder(
  db: Db,
  input: CreateNotebookFolderInput,
  at: string,
): NotebookFolder {
  const { name, parentId } = createNotebookFolderSchema.parse(input);
  return db.transaction((tx) => {
    if (parentId !== null) {
      const parent = tx.select().from(notebookFolder).where(eq(notebookFolder.id, parentId)).get();
      if (parent === undefined || parent.parentId !== null) {
        throw new NotebookRepoError('INVALID_PARENT', 'La carpeta padre debe estar en la raíz');
      }
    }
    const nameKey = normalizeFolderNameKey(name);
    const sibling = tx.select({ id: notebookFolder.id }).from(notebookFolder)
      .where(and(
        parentId === null ? isNull(notebookFolder.parentId) : eq(notebookFolder.parentId, parentId),
        eq(notebookFolder.nameKey, nameKey),
      )).get();
    if (sibling !== undefined) {
      throw new NotebookRepoError('VALIDATION', 'Ya existe una carpeta con ese nombre en este nivel');
    }
    return tx.insert(notebookFolder).values({ name, nameKey, parentId, createdAt: at, updatedAt: at })
      .returning().get();
  });
}

export function updateNotebookFolder(
  db: Db,
  input: UpdateNotebookFolderInput,
  at: string,
): NotebookFolder {
  const { id, name, parentId } = updateNotebookFolderSchema.parse(input);
  return db.transaction((tx) => {
    const existing = tx.select().from(notebookFolder).where(eq(notebookFolder.id, id)).get();
    if (existing === undefined) throw new NotebookRepoError('NOT_FOUND', 'Carpeta no encontrada');
    if (parentId === id) throw new NotebookRepoError('INVALID_PARENT', 'Una carpeta no puede ser su propio padre');
    if (parentId !== null) {
      const parent = tx.select().from(notebookFolder).where(eq(notebookFolder.id, parentId)).get();
      if (parent === undefined || parent.parentId !== null) {
        throw new NotebookRepoError('INVALID_PARENT', 'La carpeta padre debe estar en la raíz');
      }
      const child = tx.select({ id: notebookFolder.id }).from(notebookFolder)
        .where(eq(notebookFolder.parentId, id)).get();
      if (child !== undefined) {
        throw new NotebookRepoError('INVALID_PARENT', 'Una carpeta con subcarpetas debe seguir en la raíz');
      }
    }
    const nameKey = normalizeFolderNameKey(name);
    const sibling = tx.select({ id: notebookFolder.id }).from(notebookFolder)
      .where(and(
        parentId === null ? isNull(notebookFolder.parentId) : eq(notebookFolder.parentId, parentId),
        eq(notebookFolder.nameKey, nameKey),
        ne(notebookFolder.id, id),
      )).get();
    if (sibling !== undefined) {
      throw new NotebookRepoError('VALIDATION', 'Ya existe una carpeta con ese nombre en este nivel');
    }
    return tx.update(notebookFolder).set({ name, nameKey, parentId, updatedAt: at })
      .where(eq(notebookFolder.id, id)).returning().get();
  });
}

export function deleteNotebookFolder(db: Db, id: number): void {
  const parsed = deleteNotebookFolderSchema.parse({ id });
  db.transaction((tx) => {
    const existing = tx.select({ id: notebookFolder.id }).from(notebookFolder)
      .where(eq(notebookFolder.id, parsed.id)).get();
    if (existing === undefined) throw new NotebookRepoError('NOT_FOUND', 'Carpeta no encontrada');
    const hasChildren = tx.select({ count: sql<number>`count(*)` }).from(notebookFolder)
      .where(eq(notebookFolder.parentId, parsed.id)).get()?.count !== 0;
    const hasNotes = tx.select({ count: sql<number>`count(*)` }).from(notebookNote)
      .where(eq(notebookNote.folderId, parsed.id)).get()?.count !== 0;
    if (hasChildren || hasNotes) {
      throw new NotebookRepoError('FOLDER_NOT_EMPTY', 'La carpeta contiene subcarpetas o apuntes');
    }
    tx.delete(notebookFolder).where(eq(notebookFolder.id, parsed.id)).run();
  });
}

export function getNotebookNote(db: Db, id: number): NotebookNote | null {
  return db.select().from(notebookNote).where(eq(notebookNote.id, id)).get() ?? null;
}

export function getNotebookNoteByUid(db: Db, uid: string): NotebookNote | null {
  return db.select().from(notebookNote).where(eq(notebookNote.uid, uid)).get() ?? null;
}

export function listNotebookNotes(
  db: Db,
  folderId: number | null,
  page: number,
  pageSize = 20,
): NotebookPage<NotebookNoteSummary> {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new NotebookRepoError('VALIDATION', 'Página inválida');
  }
  const rows = db.select(noteSummary).from(notebookNote)
    .where(folderId === null ? isNull(notebookNote.folderId) : eq(notebookNote.folderId, folderId))
    .orderBy(asc(notebookNote.title), asc(notebookNote.id))
    .limit(pageSize + 1).offset((page - 1) * pageSize).all();
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export function listRecentNotebookNotes(db: Db, limit = 20): NotebookNoteSummary[] {
  return db.select(noteSummary).from(notebookNote)
    .orderBy(desc(notebookNote.updatedAt), desc(notebookNote.id)).limit(limit).all();
}

/** Reintentar el mismo UID devuelve la creación confirmada, sin duplicarla. */
export function createNotebookNote(
  db: Db,
  input: CreateNotebookNoteInput,
  at: string,
): { readonly note: NotebookNote; readonly created: boolean } {
  const data = createNotebookNoteSchema.parse(input);
  const searchBody = analyzeNotebookMarkdown(data.contentMarkdown).searchText;
  const searchTitle = normalizeNotebookSearchText(data.title);
  const searchTags = normalizeNotebookSearchText(data.tags.join(' '));
  return db.transaction((tx) => {
    if (data.folderId !== null) {
      const folder = tx.select({ id: notebookFolder.id }).from(notebookFolder)
        .where(eq(notebookFolder.id, data.folderId)).get();
      if (folder === undefined) throw new NotebookRepoError('INVALID_PARENT', 'Carpeta no encontrada');
    }
    const inserted = tx.insert(notebookNote).values({ ...data, revision: 1, createdAt: at, updatedAt: at })
      .onConflictDoNothing({ target: notebookNote.uid }).returning().get();
    if (inserted !== undefined) {
      tx.run(sql`INSERT INTO notebook_note_fts (rowid, title, body, tags)
        VALUES (${inserted.id}, ${searchTitle}, ${searchBody}, ${searchTags})`);
      return { note: inserted, created: true };
    }
    const existing = tx.select().from(notebookNote).where(eq(notebookNote.uid, data.uid)).get();
    if (existing === undefined) throw new NotebookRepoError('PERSISTENCE', 'No se pudo confirmar el alta');
    return { note: existing, created: false };
  });
}

/** CAS por ID, UID y revisión: una escritura antigua nunca pisa la nueva. */
export function saveNotebookNote(db: Db, input: SaveNotebookNoteInput, at: string): NotebookNote {
  const { id, uid, expectedRevision, ...changes } = saveNotebookNoteSchema.parse(input);
  const searchBody = analyzeNotebookMarkdown(changes.contentMarkdown).searchText;
  const searchTitle = normalizeNotebookSearchText(changes.title);
  const searchTags = normalizeNotebookSearchText(changes.tags.join(' '));
  return db.transaction((tx) => {
    if (changes.folderId !== null) {
      const folder = tx.select({ id: notebookFolder.id }).from(notebookFolder)
        .where(eq(notebookFolder.id, changes.folderId)).get();
      if (folder === undefined) throw new NotebookRepoError('INVALID_PARENT', 'Carpeta no encontrada');
    }
    const saved = tx.update(notebookNote).set({
      ...changes,
      revision: expectedRevision + 1,
      updatedAt: at,
    }).where(and(
      eq(notebookNote.id, id),
      eq(notebookNote.uid, uid),
      eq(notebookNote.revision, expectedRevision),
    )).returning().get();
    if (saved !== undefined) {
      tx.run(sql`INSERT INTO notebook_note_fts (rowid, title, body, tags)
        VALUES (${saved.id}, ${searchTitle}, ${searchBody}, ${searchTags})`);
      return saved;
    }
    const current = tx.select().from(notebookNote).where(eq(notebookNote.id, id)).get();
    if (current === undefined) throw new NotebookRepoError('NOT_FOUND', 'Apunte eliminado');
    throw new NotebookRepoError('CONFLICT', 'El apunte cambió en otra pestaña', current);
  });
}

export function deleteNotebookNote(db: Db, input: DeleteNotebookNoteInput): void {
  const { id, uid, expectedRevision } = deleteNotebookNoteSchema.parse(input);
  db.transaction((tx) => {
    const deleted = tx.delete(notebookNote).where(and(
      eq(notebookNote.id, id),
      eq(notebookNote.uid, uid),
      eq(notebookNote.revision, expectedRevision),
    )).returning({ id: notebookNote.id }).get();
    if (deleted !== undefined) return;
    const current = tx.select().from(notebookNote).where(eq(notebookNote.id, id)).get();
    if (current === undefined) throw new NotebookRepoError('NOT_FOUND', 'Apunte eliminado');
    throw new NotebookRepoError('CONFLICT', 'El apunte cambió en otra pestaña', current);
  });
}
