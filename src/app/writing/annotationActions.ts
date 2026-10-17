'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getDb } from '@/lib/db/client';
import { updateWritingText } from '@/lib/db/writingTextRepo';
import {
  createWritingAnnotation,
  deleteWritingAnnotation,
  placeWritingAnnotation,
  restoreWritingAnnotation,
  setWritingAnnotationReviewed,
  updateWritingAnnotation,
  type WritingAnnotationRow,
} from '@/lib/db/writingAnnotationRepo';
import { createWritingAnnotationSchema, placeWritingAnnotationSchema, updateWritingAnnotationSchema, writingAnnotationIdSchema } from '@/lib/writing/annotation';
import { WRITING_LIMITS } from '@/lib/writing/limits';
import { normalizeWritingText } from '@/lib/writing/text';
import { getT } from '../_shared/i18nServer';

const undoTokens = new Map<string, WritingAnnotationRow>();
const MAX_UNDO_TOKENS = 100;

export type AnnotationActionResult = { readonly ok: true; readonly message: string } | { readonly ok: false; readonly message: string };

function failureMessage(reason: 'missing' | 'text' | 'target' | 'stale' | 'duplicate', t: Awaited<ReturnType<typeof getT>>) {
  const messages = t.writing.reading;
  switch (reason) {
    case 'missing': return messages.missingAnnotation;
    case 'text': return messages.missingText;
    case 'target': return messages.invalidTarget;
    case 'stale': return messages.staleAnchor;
    case 'duplicate': return messages.restoreConflict;
  }
}

function refreshWriting() {
  revalidatePath('/writing', 'page');
  revalidatePath('/writing/[writingKey]', 'page');
}

export async function createWritingAnnotationAction(raw: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const parsed = createWritingAnnotationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: t.writing.reading.invalidInput };
  const result = createWritingAnnotation(getDb(), parsed.data, new Date());
  if (!result.ok) return { ok: false, message: failureMessage(result.reason, t) };
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationSaved };
}

export async function updateWritingAnnotationAction(raw: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const parsed = updateWritingAnnotationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: t.writing.reading.invalidInput };
  const result = updateWritingAnnotation(getDb(), parsed.data, new Date());
  if (!result.ok) return { ok: false, message: failureMessage(result.reason, t) };
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationSaved };
}

export async function placeWritingAnnotationAction(raw: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const parsed = placeWritingAnnotationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: t.writing.reading.invalidInput };
  const result = placeWritingAnnotation(getDb(), parsed.data, new Date());
  if (!result.ok) return { ok: false, message: failureMessage(result.reason, t) };
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationPlaced };
}

export async function reviewWritingAnnotationAction(rawId: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const id = writingAnnotationIdSchema.safeParse(rawId);
  if (!id.success) return { ok: false, message: t.writing.reading.invalidInput };
  if (setWritingAnnotationReviewed(getDb(), id.data, new Date().toISOString(), new Date()) === null) {
    return { ok: false, message: t.writing.reading.missingAnnotation };
  }
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationStudied };
}

export async function deleteWritingAnnotationAction(rawId: unknown): Promise<
  | { readonly ok: true; readonly message: string; readonly undoToken: string }
  | { readonly ok: false; readonly message: string }
> {
  const t = await getT();
  const id = writingAnnotationIdSchema.safeParse(rawId);
  if (!id.success) return { ok: false, message: t.writing.reading.invalidInput };
  const row = deleteWritingAnnotation(getDb(), id.data);
  if (row === null) return { ok: false, message: t.writing.reading.missingAnnotation };
  if (undoTokens.size >= MAX_UNDO_TOKENS) {
    const oldest = undoTokens.keys().next();
    if (!oldest.done) undoTokens.delete(oldest.value);
  }
  const undoToken = randomUUID();
  undoTokens.set(undoToken, row);
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationDeleted, undoToken };
}

export async function restoreWritingAnnotationAction(rawToken: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const parsed = z.uuid().safeParse(rawToken);
  if (!parsed.success) return { ok: false, message: t.writing.reading.invalidInput };
  const row = undoTokens.get(parsed.data);
  if (row === undefined) return { ok: false, message: t.writing.reading.restoreConflict };
  const result = restoreWritingAnnotation(getDb(), row);
  if (!result.ok) return { ok: false, message: failureMessage(result.reason, t) };
  undoTokens.delete(parsed.data);
  refreshWriting();
  return { ok: true, message: t.writing.reading.annotationRestored };
}

export async function updateWritingTextAction(rawId: unknown, rawText: unknown): Promise<AnnotationActionResult> {
  const t = await getT();
  const id = z.number().int().positive().safeParse(rawId);
  const parsedText = z.string().max(WRITING_LIMITS.text).transform(normalizeWritingText)
    .pipe(z.string().min(1).max(WRITING_LIMITS.text)).safeParse(rawText);
  if (!id.success || !parsedText.success) return { ok: false, message: t.writing.reading.transcriptionInvalid };
  const result = updateWritingText(getDb(), id.data, parsedText.data, new Date());
  if (!result.ok) return { ok: false, message: t.writing.reading.writingMissing };
  refreshWriting();
  return { ok: true, message: t.writing.reading.transcriptionSaved };
}
