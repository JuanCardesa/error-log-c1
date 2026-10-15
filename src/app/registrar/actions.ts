'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import {
  createError,
  createSession,
  deleteError,
  deleteSession,
  getError,
  getSession,
  hasWritingPiece,
  sessionDeletionImpact,
  setSessionStatus,
  updateError,
  updateSession,
} from '@/lib/db/repo';
import { CAUSES, generatesCard } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';
import { formErrors } from '@/lib/i18n/zod';
import { toIsoDate } from '@/lib/time/dates';
import { errorInputSchema, sessionInputSchema } from '@/lib/validation/schemas';
import { checkbox, collectIssues, integer, isValidId, text } from '../_shared/formData';
import { getT } from '../_shared/i18nServer';
import type { ActionResult, FormState } from './formState';

/**
 * Acciones de servidor de la vista Registrar.
 *
 * Toda escritura pasa por Zod antes de tocar la base. Los CHECK de SQLite estan detras
 * como ultima linea, pero el mensaje util para la persona sale de aqui, en el idioma
 * de su interfaz.
 */

/** Cabecera de sesion: la comparten el alta y la correccion, con el mismo Zod. */
function parseSessionForm(form: FormData, status: 'OPEN' | 'CLOSED', t: Messages) {
  return sessionInputSchema({ today: toIsoDate(new Date()), t }).safeParse({
    date: text(form, 'date'),
    kind: text(form, 'kind'),
    paper: text(form, 'paper') === '' && form.has('paper') ? null : text(form, 'paper'),
    part: integer(form, 'part'),
    source: text(form, 'source'),
    sourceRef: text(form, 'sourceRef'),
    itemsTotal: integer(form, 'itemsTotal'),
    itemsCorrect: integer(form, 'itemsCorrect'),
    durationMin: integer(form, 'durationMin'),
    timed: checkbox(form, 'timed'),
    status,
  }, { error: formErrors(t) });
}

export async function createSessionAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const t = await getT();
  const parsed = parseSessionForm(form, 'OPEN', t);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: t.sessionActions.headerInvalidCreate,
    };
  }

  const created = createSession(getDb(), parsed.data);
  revalidatePath('/', 'layout');

  return {
    ok: true,
    fieldErrors: {},
    message: t.sessionActions.sessionOpened(created.id),
    createdId: created.id,
  };
}

/**
 * Los campos de un error tal y como se teclean. La comparten el alta y la edicion para
 * que las reglas no puedan divergir entre crear y corregir.
 *
 * Nada de Anki ni de `secs` sale de aqui: el formulario no los trae, y lo que decide si
 * un error esta convertido es la fila guardada, no un campo oculto que cualquier POST
 * puede omitir.
 */
function errorFormValues(form: FormData, sessionTimed: boolean) {
  return {
    sessionId: integer(form, 'sessionId'),
    itemRef: text(form, 'itemRef'),
    prompt: text(form, 'prompt'),
    myAnswer: text(form, 'myAnswer'),
    correctAnswer: text(form, 'correctAnswer'),
    cause: text(form, 'cause'),
    category: text(form, 'category'),
    subcategory: text(form, 'subcategory'),
    confidence: text(form, 'confidence'),
    // `late_in_session` solo significa algo con cronometro (§3 del spec original).
    lateInSession: sessionTimed ? checkbox(form, 'lateInSession') : false,
    ruleNote: text(form, 'ruleNote'),
  };
}

/** Un despiste no se arregla estudiando: convertirlo en tarjeta es el error clasico. */
function rejectImpossibleCard(cause: string, ankiAdded: boolean, t: Messages): FormState | null {
  if (!ankiAdded) return null;
  if (generatesCard(cause as Parameters<typeof generatesCard>[0])) return null;
  const known = CAUSES.find((value) => value === cause);
  return {
    ok: false,
    fieldErrors: {
      ankiAdded: [t.sessionActions.impossibleCard(known === undefined ? cause : t.labels.cause[known])],
    },
    message: null,
  };
}

export async function addErrorAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const t = await getT();
  const sessionId = integer(form, 'sessionId');
  if (sessionId === null || Number.isNaN(sessionId)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.missingSession };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.sessionGone };
  }
  if (session.status === 'CLOSED') {
    return {
      ok: false,
      fieldErrors: {},
      message: t.sessionActions.sessionClosed,
    };
  }

  // Un error nace sin convertir: la conversion se sella al crear la nota en Anki.
  const parsed = errorInputSchema(t).safeParse(errorFormValues(form, session.timed), { error: formErrors(t) });
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  const created = createError(getDb(), parsed.data);
  revalidatePath('/', 'layout');

  return { ok: true, fieldErrors: {}, message: null, createdId: created.id };
}

/** Corregir una fila ya registrada. §6 lo pide: nada de datos que no se puedan arreglar. */
export async function updateErrorAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const t = await getT();
  const id = integer(form, 'id');
  if (!isValidId(id)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.missingErrorToCorrect };
  }

  const sessionId = integer(form, 'sessionId');
  if (sessionId === null || Number.isNaN(sessionId)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.missingSession };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.sessionGone };
  }

  const original = getError(getDb(), id);
  if (original === null || original.sessionId !== sessionId) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.errorGoneInSession };
  }

  const parsed = errorInputSchema(t).safeParse(errorFormValues(form, session.timed), { error: formErrors(t) });
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  // Si esta convertido lo dice la fila, no el formulario: cambiar la causa de un error
  // que ya tiene tarjeta sigue teniendo que poder rechazarse.
  const impossible = rejectImpossibleCard(parsed.data.cause, original.ankiAdded, t);
  if (impossible !== null) return impossible;

  if (!updateError(getDb(), id, parsed.data)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.errorGone };
  }
  revalidatePath('/', 'layout');
  return { ok: true, fieldErrors: {}, message: t.sessionActions.errorCorrected, createdId: id };
}

/** Corregir la cabecera de una sesion pasada, sin tocar sus errores. */
export async function updateSessionAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const t = await getT();
  const id = integer(form, 'id');
  if (!isValidId(id)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.missingSessionToCorrect };
  }

  const parsed = parseSessionForm(form, text(form, 'status') === 'CLOSED' ? 'CLOSED' : 'OPEN', t);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: t.sessionActions.checkHeader,
    };
  }

  if (parsed.data.paper !== 'WRITING' && hasWritingPiece(getDb(), id)) {
    return { ok: false, fieldErrors: { paper: [t.sessionActions.writingLinked] }, message: null };
  }
  if (!updateSession(getDb(), id, parsed.data)) {
    return { ok: false, fieldErrors: {}, message: t.sessionActions.sessionGoneKeepChanges };
  }
  revalidatePath('/', 'layout');
  return { ok: true, fieldErrors: {}, message: t.sessionActions.headerCorrected, createdId: id };
}

export async function deleteErrorAction(id: number): Promise<ActionResult> {
  const t = await getT();
  if (!isValidId(id)) return { ok: false, message: t.sessionActions.missingErrorToDelete };
  try {
    if (!deleteError(getDb(), id)) return { ok: false, message: t.sessionActions.errorGoneRefresh };
  } catch {
    return { ok: false, message: t.sessionActions.deleteErrorFailed };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: t.sessionActions.errorDeleted };
}

export async function setSessionStatusAction(
  id: number,
  status: 'OPEN' | 'CLOSED',
): Promise<ActionResult> {
  const t = await getT();
  if (!isValidId(id)) return { ok: false, message: t.sessionActions.missingSession };
  if (getSession(getDb(), id) === null) return { ok: false, message: t.sessionActions.sessionGone };
  setSessionStatus(getDb(), id, status);
  revalidatePath('/', 'layout');
  return { ok: true, message: status === 'CLOSED' ? t.sessionActions.sessionClosedDone : t.sessionActions.sessionReopened };
}

export async function deleteSessionAction(id: number): Promise<ActionResult> {
  const t = await getT();
  if (!isValidId(id)) return { ok: false, message: t.sessionActions.missingSession };
  const db = getDb();
  if (getSession(db, id) === null) return { ok: false, message: t.sessionActions.sessionGone };
  const impact = sessionDeletionImpact(db, id);
  try {
    deleteSession(db, id);
  } catch {
    return { ok: false, message: t.sessionActions.deleteSessionFailed };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: t.sessionActions.sessionDeleted(impact.errors, impact.hasWritingPiece) };
}
