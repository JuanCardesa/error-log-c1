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
import { toIsoDate } from '@/lib/time/dates';
import { checkRewriteLink } from '@/lib/validation/rewriteChain';
import { writingPieceInputSchema } from '@/lib/validation/schemas';
import { checkbox, collectIssues, integer, isValidId, text } from '../_shared/formData';
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
  const editingId = integer(form, 'id');

  if (editingId !== null && !isValidId(editingId)) {
    return { ok: false, fieldErrors: {}, message: 'El identificador del texto no es valido.' };
  }

  const parsed = writingPieceInputSchema({ today: toIsoDate(new Date()) }).safeParse(
    readPiece(form),
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
        return { ok: false, fieldErrors: {}, message: 'Ese texto ya no existe. Tus cambios siguen en el formulario.' };
      }
      if (original !== null && original.sessionId !== parsed.data.sessionId) {
        return { ok: false, fieldErrors: { sessionId: ['La sesion de un texto existente no se puede cambiar.'] }, message: null };
      }
      const session = getSession(db, parsed.data.sessionId);
      if (session === null || session.paper !== 'WRITING') {
        return { ok: false, fieldErrors: { sessionId: ['Esa sesion de Writing ya no esta disponible.'] }, message: null };
      }
      if (editingId === null && hasWritingPiece(db, session.id)) {
        return { ok: false, fieldErrors: { sessionId: ['Esa sesion ya tiene un texto. Elige otra sesion o edita el existente.'] }, message: null };
      }

      const check = checkRewriteLink(listWritingPieces(db), editingId ?? 0, parsed.data.rewriteOf);
      if (!check.ok) {
        return { ok: false, fieldErrors: { rewriteOf: [check.message] }, message: null };
      }
      if (editingId !== null) {
        updateWritingPiece(db, editingId, parsed.data);
        return { ok: true, fieldErrors: {}, message: 'Texto actualizado.', createdId: editingId };
      }
      const created = createWritingPiece(db, parsed.data);
      return { ok: true, fieldErrors: {}, message: 'Texto guardado.', createdId: created.id };
    }).immediate();
  } catch {
    return { ok: false, fieldErrors: {}, message: 'No se pudo guardar el texto. Tus cambios siguen aqui para reintentarlo.' };
  }
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
