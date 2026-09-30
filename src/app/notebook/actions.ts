'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getDb } from '@/lib/db/client';
import {
  getErrorNoteLinks, listNoteErrorLinks, removeErrorNoteLink, setErrorNoteLink,
} from '@/lib/db/notebookLinkRepo';
import {
  NotebookRepoError,
  createNotebookFolder,
  createNotebookNote,
  deleteNotebookFolder,
  deleteNotebookNote,
  getNotebookNote,
  getNotebookNoteByUid,
  saveNotebookNote,
  updateNotebookFolder,
} from '@/lib/db/notebookRepo';
import { searchNotebookNotes } from '@/lib/db/notebookSearch';
import { parseNotebookMarkdownImport, type NotebookImportDraft } from '@/lib/notebook/import';
import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import {
  createNotebookFolderSchema,
  createNotebookNoteSchema,
  deleteNotebookFolderSchema,
  deleteNotebookNoteSchema,
  finishNotebookEditingSchema,
  getErrorNoteLinksSchema,
  getNoteErrorLinksSchema,
  getNotebookNoteSchema,
  getNotebookNoteByUidSchema,
  getNotebookOutlineSchema,
  notebookImportSizeError,
  removeErrorNoteLinkSchema,
  saveNotebookNoteSchema,
  searchNotebookSchema,
  setErrorNoteLinkSchema,
  updateNotebookFolderSchema,
} from '@/lib/notebook/schemas';
import type {
  NotebookCreateResult, NotebookErrorLink, NotebookFolder, NotebookLinkedError, NotebookLinkedNote,
  NotebookNote, NotebookNoteSummary,
  NotebookOutline, NotebookPage, NotebookResult,
} from '@/lib/notebook/types';
import { notebookNoteHref } from '@/lib/notebook/urls';
import { collectIssues, text } from '../_shared/formData';

/** Cada Server Action es un POST público: validar incluso si el cliente tiene tipos. */
function validated<TSchema extends z.ZodType, T>(
  schema: TSchema,
  raw: unknown,
  operation: (input: z.output<TSchema>) => T,
): NotebookResult<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Revisa los campos indicados.',
      fieldErrors: collectIssues(parsed.error),
    };
  }
  try {
    return { ok: true, data: operation(parsed.data) };
  } catch (error) {
    if (error instanceof NotebookRepoError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.current === undefined ? {} : { current: error.current }),
      };
    }
    // Los detalles de SQLite y el Markdown personal no se devuelven al navegador.
    return { ok: false, code: 'PERSISTENCE', message: 'No se pudo completar la operación. Inténtalo de nuevo.' };
  }
}

export async function createNoteAction(raw: unknown): Promise<NotebookResult<NotebookCreateResult>> {
  return validated(createNotebookNoteSchema, raw, (input) => {
    return createNotebookNote(getDb(), input, new Date().toISOString());
  });
}

/** Autosave no invalida el lector ni recarga el editor en cada escritura. */
export async function saveNoteAction(raw: unknown): Promise<NotebookResult<NotebookNote>> {
  return validated(saveNotebookNoteSchema, raw, (input) =>
    saveNotebookNote(getDb(), input, new Date().toISOString()));
}

export async function getNoteAction(raw: unknown): Promise<NotebookResult<NotebookNote>> {
  return validated(getNotebookNoteSchema, raw, ({ id, uid }) => {
    const note = getNotebookNote(getDb(), id);
    if (note === null || (uid !== undefined && note.uid !== uid)) {
      throw new NotebookRepoError('NOT_FOUND', 'Apunte no encontrado');
    }
    return note;
  });
}

export async function getNoteByUidAction(raw: unknown): Promise<NotebookResult<NotebookNote>> {
  return validated(getNotebookNoteByUidSchema, raw, ({ uid }) => {
    const note = getNotebookNoteByUid(getDb(), uid);
    if (note === null) throw new NotebookRepoError('NOT_FOUND', 'Apunte no encontrado');
    return note;
  });
}

/** Explicitly close an edit session and invalidate the pages the reader can revisit. */
export async function finishEditingAction(raw: unknown): Promise<NotebookResult<NotebookNote>> {
  return validated(finishNotebookEditingSchema, raw, ({ id, uid, expectedRevision, previousTitle }) => {
    const note = getNotebookNote(getDb(), id);
    if (note === null || note.uid !== uid) throw new NotebookRepoError('NOT_FOUND', 'Apunte no encontrado');
    if (note.revision !== expectedRevision) {
      throw new NotebookRepoError('CONFLICT', 'El apunte cambió en otra pestaña', note);
    }
    revalidatePath('/notebook');
    revalidatePath(notebookNoteHref(note));
    if (previousTitle !== undefined && previousTitle !== note.title) {
      revalidatePath(notebookNoteHref({ id, title: previousTitle }));
    }
    return note;
  });
}

export async function deleteNoteAction(raw: unknown): Promise<NotebookResult<{ readonly id: number }>> {
  return validated(deleteNotebookNoteSchema, raw, (input) => {
    deleteNotebookNote(getDb(), input);
    revalidatePath('/notebook');
    revalidatePath('/notebook/[noteKey]', 'page');
    revalidatePath('/notebook/[noteKey]/editar', 'page');
    return { id: input.id };
  });
}

export async function createFolderAction(raw: unknown): Promise<NotebookResult<NotebookFolder>> {
  return validated(createNotebookFolderSchema, raw, (input) => {
    const folder = createNotebookFolder(getDb(), input, new Date().toISOString());
    revalidatePath('/notebook');
    return folder;
  });
}

export async function updateFolderAction(raw: unknown): Promise<NotebookResult<NotebookFolder>> {
  return validated(updateNotebookFolderSchema, raw, (input) => {
    const folder = updateNotebookFolder(getDb(), input, new Date().toISOString());
    revalidatePath('/notebook');
    return folder;
  });
}

export async function deleteFolderAction(raw: unknown): Promise<NotebookResult<{ readonly id: number }>> {
  return validated(deleteNotebookFolderSchema, raw, ({ id }) => {
    deleteNotebookFolder(getDb(), id);
    revalidatePath('/notebook');
    return { id };
  });
}

export async function searchNotesAction(raw: unknown): Promise<NotebookResult<NotebookPage<NotebookNoteSummary>>> {
  return validated(searchNotebookSchema, raw, (input) => searchNotebookNotes(getDb(), input));
}

export async function getNoteOutlineAction(raw: unknown): Promise<NotebookResult<NotebookOutline>> {
  return validated(getNotebookOutlineSchema, raw, ({ id }) => {
    const note = getNotebookNote(getDb(), id);
    if (note === null) throw new NotebookRepoError('NOT_FOUND', 'Apunte no encontrado');
    return { revision: note.revision, headings: analyzeNotebookMarkdown(note.contentMarkdown).headings };
  });
}

export async function getErrorNoteLinksAction(raw: unknown): Promise<NotebookResult<readonly NotebookLinkedNote[]>> {
  return validated(getErrorNoteLinksSchema, raw, ({ errorId }) => getErrorNoteLinks(getDb(), errorId));
}

export async function getNoteErrorLinksAction(raw: unknown): Promise<NotebookResult<NotebookPage<NotebookLinkedError>>> {
  return validated(getNoteErrorLinksSchema, raw, ({ noteId, page }) => listNoteErrorLinks(getDb(), noteId, page));
}

export async function setErrorNoteLinkAction(raw: unknown): Promise<NotebookResult<NotebookErrorLink>> {
  return validated(setErrorNoteLinkSchema, raw, (input) => {
    const db = getDb();
    const link = setErrorNoteLink(db, input, new Date().toISOString());
    const note = getNotebookNote(db, input.noteId);
    if (note !== null) revalidatePath(notebookNoteHref(note));
    return link;
  });
}

export async function removeErrorNoteLinkAction(raw: unknown): Promise<NotebookResult<NotebookErrorLink>> {
  return validated(removeErrorNoteLinkSchema, raw, (input) => {
    const db = getDb();
    const link = removeErrorNoteLink(db, input);
    const note = getNotebookNote(db, input.noteId);
    if (note !== null) revalidatePath(notebookNoteHref(note));
    return link;
  });
}

function importFailure(message: string): NotebookResult<never> {
  return { ok: false, code: 'VALIDATION', message, fieldErrors: { file: [message] } };
}

/** El tamaño se comprueba antes de leer: el nombre y el contenido se analizan de nuevo aquí. */
async function readImportFile(form: FormData): Promise<NotebookResult<NotebookImportDraft>> {
  const file = form.get('file');
  if (file === null || typeof file === 'string') return importFailure('Elige un archivo .md.');
  const sizeError = notebookImportSizeError(file.size);
  if (sizeError !== null) return importFailure(sizeError);
  const parsed = parseNotebookMarkdownImport(file.name, new Uint8Array(await file.arrayBuffer()));
  return parsed.ok ? { ok: true, data: parsed.draft } : importFailure(parsed.message);
}

/** Solo analiza: no escribe nada hasta `importMarkdownAction`. */
export async function previewMarkdownImportAction(raw: unknown): Promise<NotebookResult<NotebookImportDraft>> {
  if (!(raw instanceof FormData)) return importFailure('Elige un archivo .md.');
  try {
    return await readImportFile(raw);
  } catch {
    return { ok: false, code: 'PERSISTENCE', message: 'No se pudo leer el archivo. Vuelve a elegirlo.' };
  }
}

/**
 * Crea siempre un apunte nuevo con el UID de esta importación, nunca el del frontmatter:
 * reintentar la misma confirmación devuelve el apunte ya creado en vez de duplicarlo.
 */
export async function importMarkdownAction(raw: unknown): Promise<NotebookResult<{
  readonly href: string;
  readonly created: boolean;
}>> {
  if (!(raw instanceof FormData)) return importFailure('Elige un archivo .md.');
  let read: NotebookResult<NotebookImportDraft>;
  try {
    read = await readImportFile(raw);
  } catch {
    return { ok: false, code: 'PERSISTENCE', message: 'No se pudo leer el archivo. Vuelve a elegirlo.' };
  }
  if (!read.ok) return read;
  if (read.data.contentHash !== text(raw, 'contentHash')) {
    return importFailure('El archivo cambió desde la vista previa. Vuelve a elegirlo para revisar la versión actual.');
  }
  const folder = text(raw, 'folderId').trim();
  return validated(createNotebookNoteSchema, {
    uid: text(raw, 'uid'),
    title: text(raw, 'title'),
    folderId: folder === '' ? null : Number(folder),
    tags: raw.getAll('tags').filter((tag) => typeof tag === 'string'),
    contentMarkdown: read.data.contentMarkdown,
  }, (input) => {
    const { note, created } = createNotebookNote(getDb(), input, new Date().toISOString());
    revalidatePath('/notebook');
    return { href: notebookNoteHref(note), created };
  });
}
