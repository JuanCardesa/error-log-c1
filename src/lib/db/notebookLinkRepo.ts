import { and, asc, desc, eq } from 'drizzle-orm';

import { analyzeNotebookMarkdown, normalizeNotebookSearchText } from '../notebook/markdown';
import {
  removeErrorNoteLinkSchema, setErrorNoteLinkSchema,
  type RemoveErrorNoteLinkInput, type SetErrorNoteLinkInput,
} from '../notebook/schemas';
import type {
  NotebookErrorLink, NotebookHeading, NotebookLinkedError, NotebookLinkedNote, NotebookLinkHeadingStatus,
  NotebookNote, NotebookNoteSummary, NotebookPage,
} from '../notebook/types';
import type { Db } from './client';
import { NotebookRepoError } from './notebookRepo';
import { errorRow, notebookErrorLink, notebookNote } from './schema';

function noteSummary(note: NotebookNote): NotebookNoteSummary {
  return {
    id: note.id, uid: note.uid, folderId: note.folderId, title: note.title,
    tags: note.tags, revision: note.revision, createdAt: note.createdAt, updatedAt: note.updatedAt,
  };
}

function headingStatus(headings: readonly NotebookHeading[], link: NotebookErrorLink): NotebookLinkHeadingStatus {
  if (link.headingSlug === null || link.headingText === null) return 'none';
  const linkedText = normalizeNotebookSearchText(link.headingText);
  const matching = headings.filter((heading) =>
    normalizeNotebookSearchText(heading.text) === linkedText);
  return matching.length === 1 && matching[0]?.slug === link.headingSlug
    && matching[0].text === link.headingText ? 'valid' : 'changed';
}

/** A pair has one optional section. Updating the section keeps its original creation time. */
export function setErrorNoteLink(db: Db, input: SetErrorNoteLinkInput, at: string): NotebookErrorLink {
  const { errorId, noteId, headingSlug } = setErrorNoteLinkSchema.parse(input);
  return db.transaction((tx) => {
    const error = tx.select({ id: errorRow.id }).from(errorRow).where(eq(errorRow.id, errorId)).get();
    const note = tx.select().from(notebookNote).where(eq(notebookNote.id, noteId)).get();
    if (error === undefined || note === undefined) {
      throw new NotebookRepoError('NOT_FOUND', 'Error o apunte no encontrado');
    }
    let headingText: string | null = null;
    if (headingSlug !== null) {
      const headings = analyzeNotebookMarkdown(note.contentMarkdown).headings;
      const selected = headings.find((heading) => heading.slug === headingSlug);
      if (selected === undefined || selected.text === '') {
        throw new NotebookRepoError('VALIDATION', 'El apartado ya no existe');
      }
      const normalized = normalizeNotebookSearchText(selected.text);
      if (headings.filter((heading) => normalizeNotebookSearchText(heading.text) === normalized).length !== 1) {
        throw new NotebookRepoError('VALIDATION', 'El apartado no es inequívoco');
      }
      headingText = selected.text;
    }
    return tx.insert(notebookErrorLink)
      .values({ errorId, noteId, headingSlug, headingText, createdAt: at })
      .onConflictDoUpdate({
        target: [notebookErrorLink.errorId, notebookErrorLink.noteId],
        set: { headingSlug, headingText },
      }).returning().get();
  });
}

export function removeErrorNoteLink(db: Db, input: RemoveErrorNoteLinkInput): NotebookErrorLink {
  const { errorId, noteId } = removeErrorNoteLinkSchema.parse(input);
  const removed = db.delete(notebookErrorLink)
    .where(and(eq(notebookErrorLink.errorId, errorId), eq(notebookErrorLink.noteId, noteId)))
    .returning().get();
  if (removed === undefined) throw new NotebookRepoError('NOT_FOUND', 'Vínculo no encontrado');
  return removed;
}

/** Only notes attached to this error are parsed for section drift. */
export function getErrorNoteLinks(db: Db, errorId: number): NotebookLinkedNote[] {
  const exists = db.select({ id: errorRow.id }).from(errorRow).where(eq(errorRow.id, errorId)).get();
  if (exists === undefined) throw new NotebookRepoError('NOT_FOUND', 'Error no encontrado');
  return db.select({ link: notebookErrorLink, note: notebookNote }).from(notebookErrorLink)
    .innerJoin(notebookNote, eq(notebookErrorLink.noteId, notebookNote.id))
    .where(eq(notebookErrorLink.errorId, errorId))
    .orderBy(asc(notebookNote.title), asc(notebookNote.id)).all()
    .map(({ link, note }) => ({
      link, note: noteSummary(note),
      headingStatus: headingStatus(analyzeNotebookMarkdown(note.contentMarkdown).headings, link),
    }));
}

/** Related errors are bounded and stable even when several links share a timestamp. */
export function listNoteErrorLinks(db: Db, noteId: number, page: number, pageSize = 20): NotebookPage<NotebookLinkedError> {
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1
    || pageSize > 100 || !Number.isSafeInteger(offset)) {
    throw new NotebookRepoError('VALIDATION', 'Página inválida');
  }
  const note = db.select().from(notebookNote).where(eq(notebookNote.id, noteId)).get();
  if (note === undefined) throw new NotebookRepoError('NOT_FOUND', 'Apunte no encontrado');
  const headings = analyzeNotebookMarkdown(note.contentMarkdown).headings;
  const rows = db.select({ link: notebookErrorLink, error: errorRow }).from(notebookErrorLink)
    .innerJoin(errorRow, eq(notebookErrorLink.errorId, errorRow.id))
    .where(eq(notebookErrorLink.noteId, noteId))
    .orderBy(desc(notebookErrorLink.createdAt), desc(notebookErrorLink.errorId))
    .limit(pageSize + 1).offset(offset).all();
  return {
    items: rows.slice(0, pageSize).map(({ link, error }) => ({ link, error, headingStatus: headingStatus(headings, link) })),
    hasMore: rows.length > pageSize,
  };
}
