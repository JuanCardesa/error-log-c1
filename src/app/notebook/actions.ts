'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getDb } from '@/lib/db/client';
import {
  NotebookRepoError,
  createNotebookFolder,
  createNotebookNote,
  deleteNotebookFolder,
  deleteNotebookNote,
  getNotebookNote,
  saveNotebookNote,
  updateNotebookFolder,
} from '@/lib/db/notebookRepo';
import { searchNotebookNotes } from '@/lib/db/notebookSearch';
import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import {
  createNotebookFolderSchema,
  createNotebookNoteSchema,
  deleteNotebookFolderSchema,
  deleteNotebookNoteSchema,
  getNotebookNoteSchema,
  getNotebookOutlineSchema,
  saveNotebookNoteSchema,
  searchNotebookSchema,
  updateNotebookFolderSchema,
} from '@/lib/notebook/schemas';
import type {
  NotebookCreateResult, NotebookFolder, NotebookNote, NotebookNoteSummary,
  NotebookOutline, NotebookPage, NotebookResult,
} from '@/lib/notebook/types';
import { collectIssues } from '../_shared/formData';

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
    const result = createNotebookNote(getDb(), input, new Date().toISOString());
    revalidatePath('/notebook');
    return result;
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

export async function deleteNoteAction(raw: unknown): Promise<NotebookResult<{ readonly id: number }>> {
  return validated(deleteNotebookNoteSchema, raw, (input) => {
    deleteNotebookNote(getDb(), input);
    revalidatePath('/notebook');
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
