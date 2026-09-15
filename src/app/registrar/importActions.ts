'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { getSession, importErrors } from '@/lib/db/repo';
import { generatesCard } from '@/lib/domain/enums';
import { importBatchSchema, MAX_IMPORT_LENGTH } from '@/lib/import/errors';
import { errorInputSchema, type ErrorInput } from '@/lib/validation/schemas';
import type { FormState } from './formState';

export async function importErrorsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  const sessionId = Number(form.get('sessionId'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return { ok: false, fieldErrors: {}, message: 'Falta la sesion.' };
  const session = getSession(db, sessionId);
  if (session === null || session.status !== 'OPEN') {
    return { ok: false, fieldErrors: {}, message: 'La sesion ya no esta abierta. Reabrela para importar.' };
  }
  const raw = form.get('rows');
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, fieldErrors: {}, message: 'La tanda es demasiado grande. Dividela en partes.' };
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { return { ok: false, fieldErrors: {}, message: 'No se pudo leer la tanda. Vuelve a preparar la vista previa.' }; }
  const batch = importBatchSchema.safeParse(data);
  if (!batch.success) return { ok: false, fieldErrors: {}, message: 'La tanda debe contener entre 1 y 100 errores validos.' };

  const fieldErrors: Record<string, string[]> = {};
  const inputs: ErrorInput[] = [];
  const elapsed = Number(form.get('secs'));
  const secs = Number.isSafeInteger(elapsed) && elapsed >= 0 ? Math.round(elapsed / batch.data.length) : null;
  const now = new Date().toISOString();
  batch.data.forEach((draft, index) => {
    const parsed = errorInputSchema().safeParse({
      ...draft, sessionId, secs,
      lateInSession: session.timed && draft.lateInSession,
      ankiAddedAt: draft.ankiAdded ? now : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = `${String(index)}.${issue.path.join('.')}`;
        (fieldErrors[key] ??= []).push(issue.message);
      }
    } else if (parsed.data.ankiAdded && !generatesCard(parsed.data.cause)) {
      fieldErrors[`${String(index)}.ankiAdded`] = ['Esta causa no se arregla con una tarjeta.'];
    } else inputs.push(parsed.data);
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
