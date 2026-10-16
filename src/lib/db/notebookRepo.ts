import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { applyStudyCommand, resolveStudyAnchor, studyAnchor, type NotebookAnnotation } from '../notebook/annotations';
import { saveStudyAnnotationSchema, type SaveStudyAnnotationInput } from '../notebook/annotationSchemas';
import { notebookStudyText } from '../notebook/studyMarkdown';
import { STUDY_BARRIER } from '../notebook/studyText';

import { analyzeNotebookMarkdown, normalizeNotebookSearchText } from '../notebook/markdown';
import {
  createNotebookFolderSchema,
  createNotebookNoteSchema,
  deleteNotebookFolderSchema,
  deleteNotebookNoteSchema,
  normalizeFolderNameKey,
  saveNotebookNoteSchema,
  setNotebookNoteFavoriteSchema,
  updateNotebookFolderSchema,
  type CreateNotebookFolderInput,
  type CreateNotebookNoteInput,
  type DeleteNotebookNoteInput,
  type SaveNotebookNoteInput,
  type SetNotebookNoteFavoriteInput,
  type UpdateNotebookFolderInput,
} from '../notebook/schemas';
import type {
  NotebookErrorCode, NotebookFolder, NotebookNote, NotebookNoteSummary, NotebookPage,
} from '../notebook/types';
import { DEFAULT_LOCALE, type LazyText, getMessages } from '../i18n';
import type { Db } from './client';
import { notebookAnnotation, notebookFolder, notebookNote } from './schema';

/**
 * Errores esperados de dominio; las acciones los convierten en respuestas tipadas. El aviso
 * va sin redactar (`text`): la acción lo escribe en el idioma de la interfaz.
 */
export class NotebookRepoError extends Error {
  constructor(readonly code: NotebookErrorCode, readonly text: LazyText, readonly current?: NotebookNote) {
    super(text(getMessages(DEFAULT_LOCALE)));
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
  favoritedAt: notebookNote.favoritedAt,
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
        throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.parentMustBeRoot);
      }
    }
    const nameKey = normalizeFolderNameKey(name);
    const sibling = tx.select({ id: notebookFolder.id }).from(notebookFolder)
      .where(and(
        parentId === null ? isNull(notebookFolder.parentId) : eq(notebookFolder.parentId, parentId),
        eq(notebookFolder.nameKey, nameKey),
      )).get();
    if (sibling !== undefined) {
      throw new NotebookRepoError('VALIDATION', (t) => t.notebookErrors.folderExists);
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
    if (existing === undefined) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.folderNotFound);
    if (parentId === id) throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.ownParent);
    if (parentId !== null) {
      const parent = tx.select().from(notebookFolder).where(eq(notebookFolder.id, parentId)).get();
      if (parent === undefined || parent.parentId !== null) {
        throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.parentMustBeRoot);
      }
      const child = tx.select({ id: notebookFolder.id }).from(notebookFolder)
        .where(eq(notebookFolder.parentId, id)).get();
      if (child !== undefined) {
        throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.subfoldersStayRoot);
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
      throw new NotebookRepoError('VALIDATION', (t) => t.notebookErrors.folderExists);
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
    if (existing === undefined) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.folderNotFound);
    const hasChildren = tx.select({ count: sql<number>`count(*)` }).from(notebookFolder)
      .where(eq(notebookFolder.parentId, parsed.id)).get()?.count !== 0;
    const hasNotes = tx.select({ count: sql<number>`count(*)` }).from(notebookNote)
      .where(eq(notebookNote.folderId, parsed.id)).get()?.count !== 0;
    if (hasChildren || hasNotes) {
      throw new NotebookRepoError('FOLDER_NOT_EMPTY', (t) => t.notebookErrors.folderNotEmpty);
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
    throw new NotebookRepoError('VALIDATION', (t) => t.notebookErrors.invalidPage);
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

export function listFavoriteNotebookNotes(db: Db): NotebookNoteSummary[] {
  return db.select(noteSummary).from(notebookNote)
    .where(sql`${notebookNote.favoritedAt} IS NOT NULL`)
    .orderBy(desc(notebookNote.favoritedAt), asc(notebookNote.id)).all();
}

/** Etiquetas en uso, las más repetidas primero: son las opciones del filtro de la portada. */
export function listNotebookTags(db: Db): { readonly tag: string; readonly count: number }[] {
  return db.$client.prepare<[], { tag: string; count: number }>(`
    SELECT tag.value AS tag, count(*) AS count
    FROM notebook_note AS n, json_each(n.tags) AS tag
    GROUP BY tag.value ORDER BY count DESC, tag.value
  `).all();
}

/** La marca no participa en el CAS del contenido ni modifica la fecha de edición. */
export function setNotebookNoteFavorite(
  db: Db,
  raw: SetNotebookNoteFavoriteInput,
  at: string,
): NotebookNote {
  const { id, favorite } = setNotebookNoteFavoriteSchema.parse(raw);
  const updated = db.update(notebookNote).set({
    favoritedAt: favorite ? sql`coalesce(${notebookNote.favoritedAt}, ${at})` : null,
  })
    .where(eq(notebookNote.id, id)).returning().get();
  if (updated === undefined) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.noteNotFound);
  return updated;
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
      if (folder === undefined) throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.folderNotFound);
    }
    const inserted = tx.insert(notebookNote).values({ ...data, revision: 1, createdAt: at, updatedAt: at })
      .onConflictDoNothing({ target: notebookNote.uid }).returning().get();
    if (inserted !== undefined) {
      tx.run(sql`INSERT INTO notebook_note_fts (rowid, title, body, tags)
        VALUES (${inserted.id}, ${searchTitle}, ${searchBody}, ${searchTags})`);
      return { note: inserted, created: true };
    }
    const existing = tx.select().from(notebookNote).where(eq(notebookNote.uid, data.uid)).get();
    if (existing === undefined) throw new NotebookRepoError('PERSISTENCE', (t) => t.notebookErrors.createNotConfirmed);
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
    const previous = tx.select().from(notebookNote).where(eq(notebookNote.id, id)).get();
    if (changes.folderId !== null) {
      const folder = tx.select({ id: notebookFolder.id }).from(notebookFolder)
        .where(eq(notebookFolder.id, changes.folderId)).get();
      if (folder === undefined) throw new NotebookRepoError('INVALID_PARENT', (t) => t.notebookErrors.folderNotFound);
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
      if (previous !== undefined && previous.contentMarkdown !== saved.contentMarkdown) {
        const text = notebookStudyText(saved.contentMarkdown);
        const oldText = notebookStudyText(previous.contentMarkdown);
        for (const annotation of listNotebookAnnotations(tx, id)) {
          const anchor = resolveStudyAnchor(text, annotation.anchor, annotation.orphaned ? undefined : oldText);
          tx.update(notebookAnnotation).set({ anchor: anchor ?? annotation.anchor, orphaned: anchor === null })
            .where(eq(notebookAnnotation.id, annotation.id)).run();
        }
      }
      tx.run(sql`INSERT INTO notebook_note_fts (rowid, title, body, tags)
        VALUES (${saved.id}, ${searchTitle}, ${searchBody}, ${searchTags})`);
      return saved;
    }
    const current = tx.select().from(notebookNote).where(eq(notebookNote.id, id)).get();
    if (current === undefined) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.noteDeleted);
    throw new NotebookRepoError('CONFLICT', (t) => t.notebookErrors.changedInOtherTab, current);
  });
}

export function listNotebookAnnotations(db: Pick<Db, 'select'>, noteId: number): NotebookAnnotation[] {
  return db.select().from(notebookAnnotation).where(eq(notebookAnnotation.noteId, noteId))
    .orderBy(asc(notebookAnnotation.createdAt), asc(notebookAnnotation.id)).all();
}

/** Lee y modifica las marcas actuales en una transacción; no altera la revisión del Markdown. */
export function saveNotebookAnnotation(db: Db, raw: SaveStudyAnnotationInput, at: string): NotebookAnnotation[] {
  const input = saveStudyAnnotationSchema.parse(raw);
  return db.transaction((tx) => {
    const note = tx.select().from(notebookNote).where(eq(notebookNote.id, input.noteId)).get();
    if (note === undefined || note.uid !== input.uid) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.noteDeleted);
    if (note.revision !== input.expectedRevision) {
      throw new NotebookRepoError('CONFLICT', (t) => t.notebookErrors.changedReload);
    }
    const text = notebookStudyText(note.contentMarkdown);
    const { start, end } = input.anchor;
    const anchor = studyAnchor(text, start, end);
    if (end <= start || end > text.length || !anchor.exact.trim() || anchor.exact.includes(STUDY_BARRIER)
      || anchor.exact !== input.anchor.exact || anchor.prefix !== input.anchor.prefix || anchor.suffix !== input.anchor.suffix) {
      throw new NotebookRepoError('VALIDATION', (t) => t.notebookErrors.selectText);
    }
    const before = listNotebookAnnotations(tx, note.id);
    const after = applyStudyCommand(before, text, anchor, input.command, note.id, at, randomUUID);
    const byId = new Map(after.map((item) => [item.id, item]));
    for (const item of before) {
      if (!byId.has(item.id)) tx.delete(notebookAnnotation).where(eq(notebookAnnotation.id, item.id)).run();
    }
    const old = new Map(before.map((item) => [item.id, item]));
    for (const item of after) {
      const prior = old.get(item.id);
      if (prior === item) continue;
      if (prior === undefined) tx.insert(notebookAnnotation).values(item).run();
      else tx.update(notebookAnnotation).set(item).where(eq(notebookAnnotation.id, item.id)).run();
    }
    return after;
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
    if (current === undefined) throw new NotebookRepoError('NOT_FOUND', (t) => t.notebookErrors.noteDeleted);
    throw new NotebookRepoError('CONFLICT', (t) => t.notebookErrors.changedInOtherTab, current);
  });
}
