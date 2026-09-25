'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { getSession, importErrors } from '@/lib/db/repo';
import { importSessionWithErrors } from '@/lib/db/sessionImport';
import { validateImportRows } from '@/lib/import/validateRows';
import { toIsoDate } from '@/lib/time/dates';
import { importBatchSchema, importParseOptions, sessionImportRowsSchema, MAX_IMPORT_LENGTH, MAX_IMPORT_ROWS, MAX_SESSION_IMPORT_ROWS } from '@/lib/import/errors';
import type { FormState } from './formState';

export async function importErrorsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  const sessionId = Number(form.get('sessionId'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return { ok: false, fieldErrors: {}, message: 'Falta la sesión.' };
  const session = getSession(db, sessionId);
  if (session === null || session.status !== 'OPEN') {
    return { ok: false, fieldErrors: {}, message: 'La sesión ya no está abierta. Reábrela para importar.' };
  }
  const isEnvelope = form.has('envelope');
  const raw = form.get(isEnvelope ? 'envelope' : 'rows');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: 'La tanda es demasiado grande. Divídela en partes.' };
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: 'No se pudo leer la tanda. Vuelve a preparar la vista previa.' }; }
  if (isEnvelope) {
    // La cabecera no se escribe: solo se validan los errores para la sesión abierta.
    data = data !== null && typeof data === 'object' && !Array.isArray(data) && 'errors' in data ? data.errors : undefined;
  }
  const batch = (isEnvelope ? sessionImportRowsSchema.min(1) : importBatchSchema).safeParse(data, importParseOptions);
  if (!batch.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of batch.error.issues) (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
    return { ok: false, fieldErrors, message: `La tanda debe contener entre 1 y ${String(isEnvelope ? MAX_SESSION_IMPORT_ROWS : MAX_IMPORT_ROWS)} errores válidos.` };
  }

  const { fieldErrors, inputs } = validateImportRows(batch.data, { sessionId, timed: session.timed });
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: 'Revisa los campos señalados. No se ha guardado ningún error de la tanda.' };
  }
  try {
    const result = importErrors(db, sessionId, inputs);
    if (!result.ok) return { ok: false, fieldErrors: {}, message: result.message };
    revalidatePath('/', 'layout');
    return {
      ok: true, fieldErrors: {},
      message: `${String(result.created)} ${result.created === 1 ? 'error guardado' : 'errores guardados'}.${result.skipped > 0 ? ` ${result.skipped === 1 ? '1 repetido omitido' : `${String(result.skipped)} repetidos omitidos`}; los existentes se conservan.` : ''}`,
    };
  } catch {
    return { ok: false, fieldErrors: {}, message: 'No se pudo guardar la tanda. Los datos siguen aquí para que puedas reintentarlo.' };
  }
}

export async function importSessionAction(_previous: FormState, form: FormData): Promise<FormState> {
  // TODO(auth): autorizar el alta cuando exista autenticación.
  const importId = form.get('importId');
  if (typeof importId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la identidad de la tanda. Prepara de nuevo la vista previa.' };
  }
  const raw = form.get('envelope');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: 'El sobre es demasiado grande o está ausente.' };
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: 'El sobre está incompleto o no es JSON válido.' }; }
  const minutes = form.get('durationMin');
  const durationMin = minutes === null || minutes === '' ? null : typeof minutes === 'string' ? Number(minutes) : Number.NaN;
  try {
    const result = importSessionWithErrors(getDb(), value, {
      today: toIsoDate(new Date()), durationMin, importId,
    });
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  } catch {
    // La transacción puede haber confirmado antes de que falle la revalidación o el transporte.
    // La identidad persistida permite repetir la operación sin crear otra sesión.
    throw new Error('No se pudo confirmar el guardado de la tanda.');
  }
}
