'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { getSession, importErrors } from '@/lib/db/repo';
import { importSessionWithErrors } from '@/lib/db/sessionImport';
import { validateImportRows } from '@/lib/import/validateRows';
import { toIsoDate } from '@/lib/time/dates';
import { importBatchSchema, importEnvelopeSchema, importIssues, MAX_IMPORT_LENGTH } from '@/lib/import/errors';
import type { FormState } from './formState';

export async function importErrorsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  const sessionId = Number(form.get('sessionId'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return { ok: false, fieldErrors: {}, message: 'Falta la sesion.' };
  const session = getSession(db, sessionId);
  if (session === null || session.status !== 'OPEN') {
    return { ok: false, fieldErrors: {}, message: 'La sesion ya no esta abierta. Reabrela para importar.' };
  }
  const isEnvelope = form.has('envelope');
  const raw = form.get(isEnvelope ? 'envelope' : 'rows');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: 'La tanda es demasiado grande. Dividela en partes.' };
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: 'No se pudo leer la tanda. Vuelve a preparar la vista previa.' }; }
  if (isEnvelope) {
    const parsed = importEnvelopeSchema(toIsoDate(new Date())).safeParse(data);
    if (!parsed.success) return { ok: false, fieldErrors: {}, message: `Sobre inválido. ${importIssues(parsed.error)}` };
    data = parsed.data.errors;
  }
  const batch = (isEnvelope ? importEnvelopeSchema(toIsoDate(new Date())).shape.errors.min(1) : importBatchSchema).safeParse(data);
  if (!batch.success) return { ok: false, fieldErrors: {}, message: `La tanda debe contener entre 1 y ${isEnvelope ? '300' : '100'} errores válidos.` };

  const { fieldErrors, inputs } = validateImportRows(batch.data, {
    sessionId, timed: session.timed, elapsed: Number(form.get('secs')), now: new Date().toISOString(),
  });
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: 'Revisa los campos señalados. No se ha guardado ningun error de la tanda.' };
  }
  try {
    const result = importErrors(db, sessionId, inputs);
    if (!result.ok) return { ok: false, fieldErrors: {}, message: result.message };
    revalidatePath('/', 'layout');
    return {
      ok: true, fieldErrors: {},
      message: `${String(result.created)} ${result.created === 1 ? 'error guardado' : 'errores guardados'}.${result.skipped > 0 ? ` ${String(result.skipped)} repetidos omitidos; los existentes se conservan.` : ''}`,
    };
  } catch {
    return { ok: false, fieldErrors: {}, message: 'No se pudo guardar la tanda. Los datos siguen aqui para que puedas reintentarlo.' };
  }
}

export async function importSessionAction(_previous: FormState, form: FormData): Promise<FormState> {
  // TODO(auth): autorizar el alta cuando exista autenticación.
  const raw = form.get('envelope');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: 'El sobre es demasiado grande o está ausente.' };
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: 'El sobre está incompleto o no es JSON válido.' }; }
  const minutes = form.get('durationMin');
  const durationMin = minutes === null || minutes === '' ? null : typeof minutes === 'string' ? Number(minutes) : Number.NaN;
  const now = new Date();
  try {
    const result = importSessionWithErrors(getDb(), value, {
      today: toIsoDate(now), now: now.toISOString(), durationMin, elapsed: Number(form.get('secs')),
    });
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  } catch {
    return { ok: false, fieldErrors: {}, message: 'No se pudo guardar. No se ha creado ninguna sesión ni guardado ningún error. Conservamos la vista previa.' };
  }
}
