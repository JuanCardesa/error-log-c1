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
  setSessionStatus,
  updateError,
  updateSession,
} from '@/lib/db/repo';
import { generatesCard } from '@/lib/domain/enums';
import { toIsoDate } from '@/lib/time/dates';
import { errorInputSchema, sessionInputSchema } from '@/lib/validation/schemas';
import { checkbox, collectIssues, integer, isValidId, text } from '../_shared/formData';
import type { FormState } from './formState';

/**
 * Acciones de servidor de la vista Registrar.
 *
 * Toda escritura pasa por Zod antes de tocar la base. Los CHECK de SQLite estan detras
 * como ultima linea, pero el mensaje util para la persona sale de aqui.
 */

/** Cabecera de sesion: la comparten el alta y la correccion, con el mismo Zod. */
function parseSessionForm(form: FormData, status: 'OPEN' | 'CLOSED') {
  return sessionInputSchema({ today: toIsoDate(new Date()) }).safeParse({
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
  });
}

export async function createSessionAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseSessionForm(form, 'OPEN');

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: 'Revisa la cabecera: no se aceptan errores hasta que sea válida.',
    };
  }

  const created = createSession(getDb(), parsed.data);
  revalidatePath('/registrar');

  return {
    ok: true,
    fieldErrors: {},
    message: `Sesión #${String(created.id)} abierta.`,
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
function rejectImpossibleCard(cause: string, ankiAdded: boolean): FormState | null {
  if (!ankiAdded) return null;
  if (generatesCard(cause as Parameters<typeof generatesCard>[0])) return null;
  return {
    ok: false,
    fieldErrors: {
      ankiAdded: [
        `Un error de ${cause} no se arregla con una tarjeta. El remedio es de protocolo, no de estudio.`,
      ],
    },
    message: null,
  };
}

export async function addErrorAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const sessionId = integer(form, 'sessionId');
  if (sessionId === null || Number.isNaN(sessionId)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la sesión.' };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: 'Esa sesión ya no existe.' };
  }
  if (session.status === 'CLOSED') {
    return {
      ok: false,
      fieldErrors: {},
      message: 'La sesión está cerrada. Reábrela para seguir añadiendo errores.',
    };
  }

  // Un error nace sin convertir: la conversion se sella al crear la nota en Anki.
  const parsed = errorInputSchema().safeParse(errorFormValues(form, session.timed));
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  const created = createError(getDb(), parsed.data);
  revalidatePath('/registrar');

  return { ok: true, fieldErrors: {}, message: null, createdId: created.id };
}

/** Corregir una fila ya registrada. §6 lo pide: nada de datos que no se puedan arreglar. */
export async function updateErrorAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const id = integer(form, 'id');
  if (!isValidId(id)) {
    return { ok: false, fieldErrors: {}, message: 'Falta el error a corregir.' };
  }

  const sessionId = integer(form, 'sessionId');
  if (sessionId === null || Number.isNaN(sessionId)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la sesión.' };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: 'Esa sesión ya no existe.' };
  }

  const original = getError(getDb(), id);
  if (original === null || original.sessionId !== sessionId) {
    return { ok: false, fieldErrors: {}, message: 'Ese error ya no existe en esta sesión. Tus cambios siguen en el formulario.' };
  }

  const parsed = errorInputSchema().safeParse(errorFormValues(form, session.timed));
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  // Si esta convertido lo dice la fila, no el formulario: cambiar la causa de un error
  // que ya tiene tarjeta sigue teniendo que poder rechazarse.
  const impossible = rejectImpossibleCard(parsed.data.cause, original.ankiAdded);
  if (impossible !== null) return impossible;

  if (!updateError(getDb(), id, parsed.data)) {
    return { ok: false, fieldErrors: {}, message: 'Ese error ya no existe. Tus cambios siguen en el formulario.' };
  }
  revalidatePath('/registrar');
  revalidatePath('/informe');
  return { ok: true, fieldErrors: {}, message: 'Error corregido.', createdId: id };
}

/** Corregir la cabecera de una sesion pasada, sin tocar sus errores. */
export async function updateSessionAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const id = integer(form, 'id');
  if (!isValidId(id)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la sesión a corregir.' };
  }

  const parsed = parseSessionForm(form, text(form, 'status') === 'CLOSED' ? 'CLOSED' : 'OPEN');

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: 'Revisa la cabecera.',
    };
  }

  if (parsed.data.paper !== 'WRITING' && hasWritingPiece(getDb(), id)) {
    return { ok: false, fieldErrors: { paper: ['Esta sesión tiene un texto asociado y debe seguir siendo de Writing.'] }, message: null };
  }
  if (!updateSession(getDb(), id, parsed.data)) {
    return { ok: false, fieldErrors: {}, message: 'Esa sesión ya no existe. Tus cambios siguen en el formulario.' };
  }
  revalidatePath('/registrar');
  revalidatePath('/informe');
  return { ok: true, fieldErrors: {}, message: 'Cabecera corregida.', createdId: id };
}

export async function deleteErrorAction(id: number): Promise<void> {
  deleteError(getDb(), id);
  revalidatePath('/registrar');
}

export async function setSessionStatusAction(
  id: number,
  status: 'OPEN' | 'CLOSED',
): Promise<void> {
  setSessionStatus(getDb(), id, status);
  revalidatePath('/registrar');
}

export async function deleteSessionAction(id: number): Promise<void> {
  deleteSession(getDb(), id);
  revalidatePath('/registrar');
}
