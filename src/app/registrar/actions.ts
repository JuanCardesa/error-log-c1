'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getDb } from '@/lib/db/client';
import {
  createError,
  createSession,
  deleteError,
  deleteSession,
  getSession,
  setSessionStatus,
  updateError,
  updateSession,
} from '@/lib/db/repo';
import { generatesCard } from '@/lib/domain/enums';
import { toIsoDate } from '@/lib/time/dates';
import { errorInputSchema, sessionInputSchema } from '@/lib/validation/schemas';
import type { FormState } from './formState';

/**
 * Acciones de servidor de la vista Registrar.
 *
 * Toda escritura pasa por Zod antes de tocar la base. Los CHECK de SQLite estan detras
 * como ultima linea, pero el mensaje util para la persona sale de aqui.
 */

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

/** `''` se trata como ausente, que es lo que manda un input numerico vacio. */
function integer(form: FormData, key: string): number | null {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function checkbox(form: FormData, key: string): boolean {
  return form.get(key) !== null;
}

function today(): string {
  return toIsoDate(new Date());
}

export async function createSessionAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = sessionInputSchema({ today: today() }).safeParse({
    date: text(form, 'date'),
    kind: text(form, 'kind'),
    paper: text(form, 'paper'),
    part: integer(form, 'part'),
    source: text(form, 'source'),
    sourceRef: text(form, 'sourceRef'),
    itemsTotal: integer(form, 'itemsTotal'),
    itemsCorrect: integer(form, 'itemsCorrect'),
    durationMin: integer(form, 'durationMin'),
    timed: checkbox(form, 'timed'),
    status: 'OPEN',
  });

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: 'Revisa la cabecera: no se aceptan errores hasta que sea valida.',
    };
  }

  const created = createSession(getDb(), parsed.data);
  revalidatePath('/registrar');

  return {
    ok: true,
    fieldErrors: {},
    message: `Sesion #${String(created.id)} abierta.`,
    createdId: created.id,
  };
}

/**
 * Lee y valida un error del formulario. La comparten el alta y la edicion para que las
 * reglas no puedan divergir entre crear y corregir.
 */
function parseErrorForm(form: FormData, sessionTimed: boolean) {
  const ankiAdded = checkbox(form, 'ankiAdded');

  return errorInputSchema().safeParse({
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
    ankiAdded,
    ankiAddedAt: ankiAdded ? new Date().toISOString() : null,
    secs: integer(form, 'secs'),
  });
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
    return { ok: false, fieldErrors: {}, message: 'Falta la sesion.' };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: 'Esa sesion ya no existe.' };
  }
  if (session.status === 'CLOSED') {
    return {
      ok: false,
      fieldErrors: {},
      message: 'La sesion esta cerrada. Reabrela para seguir añadiendo errores.',
    };
  }

  const parsed = parseErrorForm(form, session.timed);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  const impossible = rejectImpossibleCard(parsed.data.cause, parsed.data.ankiAdded);
  if (impossible !== null) return impossible;

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
  if (id === null || Number.isNaN(id)) {
    return { ok: false, fieldErrors: {}, message: 'Falta el error a corregir.' };
  }

  const sessionId = integer(form, 'sessionId');
  if (sessionId === null || Number.isNaN(sessionId)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la sesion.' };
  }

  const session = getSession(getDb(), sessionId);
  if (session === null) {
    return { ok: false, fieldErrors: {}, message: 'Esa sesion ya no existe.' };
  }

  const parsed = parseErrorForm(form, session.timed);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  const impossible = rejectImpossibleCard(parsed.data.cause, parsed.data.ankiAdded);
  if (impossible !== null) return impossible;

  updateError(getDb(), id, parsed.data);
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
  if (id === null || Number.isNaN(id)) {
    return { ok: false, fieldErrors: {}, message: 'Falta la sesion a corregir.' };
  }

  const parsed = sessionInputSchema({ today: today() }).safeParse({
    date: text(form, 'date'),
    kind: text(form, 'kind'),
    paper: text(form, 'paper'),
    part: integer(form, 'part'),
    source: text(form, 'source'),
    sourceRef: text(form, 'sourceRef'),
    itemsTotal: integer(form, 'itemsTotal'),
    itemsCorrect: integer(form, 'itemsCorrect'),
    durationMin: integer(form, 'durationMin'),
    timed: checkbox(form, 'timed'),
    status: text(form, 'status') === 'CLOSED' ? 'CLOSED' : 'OPEN',
  });

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectIssues(parsed.error),
      message: 'Revisa la cabecera.',
    };
  }

  updateSession(getDb(), id, parsed.data);
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
