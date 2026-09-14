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

  const lateInSession = checkbox(form, 'lateInSession');
  const ankiAdded = checkbox(form, 'ankiAdded');
  const cause = text(form, 'cause');

  const parsed = errorInputSchema().safeParse({
    sessionId,
    itemRef: text(form, 'itemRef'),
    prompt: text(form, 'prompt'),
    myAnswer: text(form, 'myAnswer'),
    correctAnswer: text(form, 'correctAnswer'),
    cause,
    category: text(form, 'category'),
    subcategory: text(form, 'subcategory'),
    confidence: text(form, 'confidence'),
    // `late_in_session` solo significa algo con cronometro (§3 del spec original).
    lateInSession: session.timed ? lateInSession : false,
    ruleNote: text(form, 'ruleNote'),
    ankiAdded,
    ankiAddedAt: ankiAdded ? new Date().toISOString() : null,
    secs: integer(form, 'secs'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: collectIssues(parsed.error), message: null };
  }

  // Un despiste no se arregla estudiando: convertirlo en tarjeta es el error clasico.
  if (parsed.data.ankiAdded && !generatesCard(parsed.data.cause)) {
    return {
      ok: false,
      fieldErrors: {
        ankiAdded: [
          `Un error de ${parsed.data.cause} no se arregla con una tarjeta. El remedio es de protocolo, no de estudio.`,
        ],
      },
      message: null,
    };
  }

  const created = createError(getDb(), parsed.data);
  revalidatePath('/registrar');

  return { ok: true, fieldErrors: {}, message: null, createdId: created.id };
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
