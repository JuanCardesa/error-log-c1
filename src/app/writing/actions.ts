'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getDb } from '@/lib/db/client';
import {
  createWritingPiece,
  deleteWritingPiece,
  getSession,
  getWritingPiece,
  hasWritingPiece,
  listWritingPieces,
  updateWritingPiece,
} from '@/lib/db/repo';
import { toIsoDate } from '@/lib/time/dates';
import { checkRewriteLink } from '@/lib/validation/rewriteChain';
import { writingPieceInputSchema } from '@/lib/validation/schemas';
import type { FormState } from '../registrar/formState';

function collectIssues(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    const bucket = fieldErrors[key];
    if (bucket === undefined) fieldErrors[key] = [issue.message];
    else bucket.push(issue.message);
  }
  return fieldErrors;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function integer(form: FormData, key: string): number | null {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readPiece(form: FormData) {
  return {
    sessionId: integer(form, 'sessionId'),
    date: text(form, 'date'),
    genre: text(form, 'genre'),
    wordCount: integer(form, 'wordCount'),
    minutes: integer(form, 'minutes'),
    timed: form.get('timed') !== null,
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

  if (editingId !== null && (!Number.isSafeInteger(editingId) || editingId <= 0)) {
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

export async function deleteWritingPieceAction(id: number): Promise<void> {
  deleteWritingPiece(getDb(), id);
  revalidatePath('/writing');
  revalidatePath('/informe');
}
