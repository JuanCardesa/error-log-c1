'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { getSession, importErrors } from '@/lib/db/repo';
import { importSessionWithErrors } from '@/lib/db/sessionImport';
import { validateImportRows } from '@/lib/import/validateRows';
import { toIsoDate } from '@/lib/time/dates';
import { importBatchSchema, importParseOptions, sessionImportRowsSchema, MAX_IMPORT_LENGTH, MAX_IMPORT_ROWS, MAX_SESSION_IMPORT_ROWS } from '@/lib/import/errors';
import { getT } from '../_shared/i18nServer';
import type { FormState } from './formState';

export async function importErrorsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  const t = await getT();
  const sessionId = Number(form.get('sessionId'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return { ok: false, fieldErrors: {}, message: t.sessionActions.missingSession };
  const session = getSession(db, sessionId);
  if (session === null || session.status !== 'OPEN') {
    return { ok: false, fieldErrors: {}, message: t.importActions.sessionNotOpen };
  }
  const isEnvelope = form.has('envelope');
  const raw = form.get(isEnvelope ? 'envelope' : 'rows');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: t.importActions.batchTooBig };
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: t.importActions.unreadable }; }
  if (isEnvelope) {
    // La cabecera no se escribe: solo se validan los errores para la sesión abierta.
    data = data !== null && typeof data === 'object' && !Array.isArray(data) && 'errors' in data ? data.errors : undefined;
  }
  const batch = (isEnvelope ? sessionImportRowsSchema(t).min(1) : importBatchSchema).safeParse(data, importParseOptions(t));
  if (!batch.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of batch.error.issues) (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
    return { ok: false, fieldErrors, message: t.importActions.batchRange(isEnvelope ? MAX_SESSION_IMPORT_ROWS : MAX_IMPORT_ROWS) };
  }

  const { fieldErrors, inputs } = validateImportRows(batch.data, { sessionId, timed: session.timed, t });
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.importActions.checkFieldsNoneSaved };
  }
  try {
    const result = importErrors(db, sessionId, inputs);
    if (!result.ok) {
      return { ok: false, fieldErrors: {}, message: result.reason === 'closed' ? t.importActions.closed : t.sessionActions.sessionGone };
    }
    revalidatePath('/', 'layout');
    return { ok: true, fieldErrors: {}, message: t.importActions.errorsSaved(result.created, result.skipped) };
  } catch {
    return { ok: false, fieldErrors: {}, message: t.importActions.saveFailed };
  }
}

export async function importSessionAction(_previous: FormState, form: FormData): Promise<FormState> {
  // TODO(auth): autorizar el alta cuando exista autenticación.
  const t = await getT();
  const importId = form.get('importId');
  if (typeof importId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) {
    return { ok: false, fieldErrors: {}, message: t.importActions.missingImportId };
  }
  const raw = form.get('envelope');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: t.importActions.envelopeTooBig };
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: t.importActions.envelopeInvalid }; }
  const minutes = form.get('durationMin');
  const durationMin = minutes === null || minutes === '' ? null : typeof minutes === 'string' ? Number(minutes) : Number.NaN;
  try {
    const result = importSessionWithErrors(getDb(), value, {
      today: toIsoDate(new Date()), durationMin, importId, t,
    });
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  } catch {
    // La transacción puede haber confirmado antes de que falle la revalidación o el transporte.
    // La identidad persistida permite repetir la operación sin crear otra sesión.
    throw new Error('No se pudo confirmar el guardado de la tanda.');
  }
}
