'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getDb } from '@/lib/db/client';
import {
  createWritingPiece,
  deleteWritingPiece,
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

  const parsed = writingPieceInputSchema({ today: toIsoDate(new Date()) }).safeParse(
    readPiece(form),
  );

  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  /*
   * Los ciclos de reescritura necesitan el grafo entero, asi que no caben en un esquema
   * de campo. La base solo puede impedir que un texto se apunte a si mismo.
   */
  const existing = listWritingPieces(db);
  const check = checkRewriteLink(
    existing,
    editingId ?? 0,
    parsed.data.rewriteOf,
  );
  if (!check.ok) {
    return { ok: false, fieldErrors: { rewriteOf: [check.message] }, message: null };
  }

  if (editingId !== null && !Number.isNaN(editingId)) {
    updateWritingPiece(db, editingId, parsed.data);
    revalidatePath('/writing');
    return { ok: true, fieldErrors: {}, message: 'Texto actualizado.', createdId: editingId };
  }

  const created = createWritingPiece(db, parsed.data);
  revalidatePath('/writing');
  revalidatePath('/informe');
  return { ok: true, fieldErrors: {}, message: 'Texto guardado.', createdId: created.id };
}

export async function deleteWritingPieceAction(id: number): Promise<void> {
  deleteWritingPiece(getDb(), id);
  revalidatePath('/writing');
  revalidatePath('/informe');
}
