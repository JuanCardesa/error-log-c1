'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import {
  createWritingPiece,
  getSession,
  getWritingPiece,
  hasWritingPiece,
  listWritingPieces,
  updateWritingPiece,
} from '@/lib/db/repo';
import { formErrors } from '@/lib/i18n/zod';
import { toIsoDate } from '@/lib/time/dates';
import { checkRewriteLink } from '@/lib/validation/rewriteChain';
import { writingPieceInputSchema } from '@/lib/validation/schemas';
import { checkbox, collectIssues, integer, isValidId, text } from '../_shared/formData';
import { getT } from '../_shared/i18nServer';
import type { FormState } from '../registrar/formState';

function readPiece(form: FormData) {
  return {
    sessionId: integer(form, 'sessionId'),
    date: text(form, 'date'),
    genre: text(form, 'genre'),
    wordCount: integer(form, 'wordCount'),
    minutes: integer(form, 'minutes'),
    timed: checkbox(form, 'timed'),
    rewriteOf: integer(form, 'rewriteOf'),
    corrector: text(form, 'corrector') === '' ? null : text(form, 'corrector'),
    bandContent: integer(form, 'bandContent'),
    bandCommunicative: integer(form, 'bandCommunicative'),
    bandOrganisation: integer(form, 'bandOrganisation'),
    bandLanguage: integer(form, 'bandLanguage'),
  };
}

export async function saveWritingPieceAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const db = getDb();
  const t = await getT();
  const editingId = integer(form, 'id');

  if (editingId !== null && !isValidId(editingId)) {
    return { ok: false, fieldErrors: {}, message: t.writing.invalidId };
  }

  const parsed = writingPieceInputSchema({ today: toIsoDate(new Date()), t }).safeParse(
    readPiece(form),
    { error: formErrors(t) },
  );

  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  let result: FormState;
  try {
    // La validacion y la escritura comparten bloqueo: otra pestaña no puede ocupar
    // la sesion ni cambiar la cadena de reescrituras entre ambas operaciones.
    result = db.$client.transaction((): FormState => {
      const original = editingId === null ? null : getWritingPiece(db, editingId);
      if (editingId !== null && original === null) {
        return { ok: false, fieldErrors: {}, message: t.writing.gone };
      }
      if (original !== null && original.sessionId !== parsed.data.sessionId) {
        return { ok: false, fieldErrors: { sessionId: [t.writing.sessionLocked] }, message: null };
      }
      const session = getSession(db, parsed.data.sessionId);
      if (session === null || session.paper !== 'WRITING') {
        return { ok: false, fieldErrors: { sessionId: [t.writing.sessionUnavailable] }, message: null };
      }
      if (editingId === null && hasWritingPiece(db, session.id)) {
        return { ok: false, fieldErrors: { sessionId: [t.writing.sessionTaken] }, message: null };
      }

      const check = checkRewriteLink(listWritingPieces(db), editingId ?? 0, parsed.data.rewriteOf);
      if (!check.ok) {
        return { ok: false, fieldErrors: { rewriteOf: [t.writing.rewriteErrors[check.reason]] }, message: null };
      }
      if (editingId !== null) {
        updateWritingPiece(db, editingId, parsed.data);
        return { ok: true, fieldErrors: {}, message: t.writing.textUpdated, createdId: editingId };
      }
      const created = createWritingPiece(db, parsed.data);
      return { ok: true, fieldErrors: {}, message: t.writing.textSaved, createdId: created.id };
    }).immediate();
  } catch {
    return { ok: false, fieldErrors: {}, message: t.writing.saveFailed };
  }
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
