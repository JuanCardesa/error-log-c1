import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { StudyAnchor } from '../notebook/annotations';
import { paragraphsOf } from '../writing/text';
import type { CreateWritingAnnotation, PlaceWritingAnnotation, UpdateWritingAnnotation } from '../writing/annotation';
import type { Db } from './client';
import { writingAnnotation, writingPiece } from './schema';

export type WritingAnnotationRow = typeof writingAnnotation.$inferSelect;

function makeAnchor(text: string, start: number, end: number): StudyAnchor | null {
  if (start < 0 || end <= start || end > text.length || text.slice(start, end).trim() === '') return null;
  const exact = text.slice(start, end);
  return { start, end, exact, prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}

function validAnchor(text: string, anchor: StudyAnchor | null): anchor is StudyAnchor {
  return anchor !== null && anchor.start >= 0 && anchor.end > anchor.start && anchor.end <= text.length
    && text.slice(anchor.start, anchor.end) === anchor.exact;
}

export type AnnotationWriteResult =
  | { readonly ok: true; readonly row: WritingAnnotationRow }
  | { readonly ok: false; readonly reason: 'missing' | 'text' | 'target' | 'stale' | 'duplicate' };

export function createWritingAnnotation(db: Db, input: CreateWritingAnnotation, now: Date): AnnotationWriteResult {
  return db.transaction((tx): AnnotationWriteResult => {
    const piece = tx.select({ text: writingPiece.originalText }).from(writingPiece).where(eq(writingPiece.id, input.pieceId)).get();
    if (piece === undefined) return { ok: false, reason: 'missing' };
    if (piece.text === null) return { ok: false, reason: 'text' };
    let anchor: StudyAnchor | null = null;
    let paragraph: number | null = null;
    let quote: string | null = null;
    if (input.scope === 'SPAN') {
      anchor = makeAnchor(piece.text, input.start, input.end);
      if (anchor === null) return { ok: false, reason: 'target' };
      quote = anchor.exact;
    } else if (input.scope === 'PARAGRAPH') {
      if (!paragraphsOf(piece.text).some((item) => item.number === input.paragraph)) return { ok: false, reason: 'target' };
      paragraph = input.paragraph;
    }
    const at = now.toISOString();
    const row = tx.insert(writingAnnotation).values({
      id: randomUUID(), pieceId: input.pieceId, kind: input.kind, focus: input.focus, source: input.source,
      scope: input.scope, anchor, paragraph, quote, comment: input.comment, suggestion: input.suggestion,
      reviewedAt: null, importKey: null, createdAt: at, updatedAt: at,
    }).returning().get();
    return { ok: true, row };
  }, { behavior: 'immediate' });
}

export function updateWritingAnnotation(db: Db, input: UpdateWritingAnnotation, now: Date): AnnotationWriteResult {
  return db.transaction((tx): AnnotationWriteResult => {
    const current = tx.select().from(writingAnnotation).where(eq(writingAnnotation.id, input.id)).get();
    if (current === undefined) return { ok: false, reason: 'missing' };
    const piece = tx.select({ text: writingPiece.originalText }).from(writingPiece).where(eq(writingPiece.id, current.pieceId)).get();
    if (piece === undefined) return { ok: false, reason: 'missing' };
    if (piece.text === null) return { ok: false, reason: 'text' };
    if (current.scope === 'SPAN' && current.anchor !== null && !validAnchor(piece.text, current.anchor)) return { ok: false, reason: 'stale' };
    const row = tx.update(writingAnnotation).set({
      kind: input.kind, focus: input.focus, source: input.source, comment: input.comment, suggestion: input.suggestion,
      updatedAt: now.toISOString(),
    }).where(eq(writingAnnotation.id, input.id)).returning().get();
    return row === undefined ? { ok: false, reason: 'missing' } : { ok: true, row };
  }, { behavior: 'immediate' });
}

export function placeWritingAnnotation(db: Db, input: PlaceWritingAnnotation, now: Date): AnnotationWriteResult {
  return db.transaction((tx): AnnotationWriteResult => {
    const current = tx.select().from(writingAnnotation).where(eq(writingAnnotation.id, input.id)).get();
    if (current === undefined) return { ok: false, reason: 'missing' };
    if (current.scope !== 'SPAN' || current.anchor !== null) return { ok: false, reason: 'target' };
    const piece = tx.select({ text: writingPiece.originalText }).from(writingPiece).where(eq(writingPiece.id, current.pieceId)).get();
    if (piece === undefined) return { ok: false, reason: 'missing' };
    if (piece.text === null) return { ok: false, reason: 'text' };
    const anchor = makeAnchor(piece.text, input.start, input.end);
    if (anchor === null) return { ok: false, reason: 'target' };
    const row = tx.update(writingAnnotation).set({ anchor, quote: anchor.exact, updatedAt: now.toISOString() })
      .where(and(eq(writingAnnotation.id, input.id), eq(writingAnnotation.pieceId, current.pieceId))).returning().get();
    return row === undefined ? { ok: false, reason: 'missing' } : { ok: true, row };
  }, { behavior: 'immediate' });
}

export function setWritingAnnotationReviewed(db: Db, id: string, reviewedAt: string | null, now: Date): WritingAnnotationRow | null {
  const row = db.update(writingAnnotation).set({ reviewedAt, updatedAt: now.toISOString() })
    .where(eq(writingAnnotation.id, id)).returning().get();
  return row ?? null;
}

export function deleteWritingAnnotation(db: Db, id: string): WritingAnnotationRow | null {
  const row = db.delete(writingAnnotation).where(eq(writingAnnotation.id, id)).returning().get();
  return row ?? null;
}

export function restoreWritingAnnotation(db: Db, row: WritingAnnotationRow): AnnotationWriteResult {
  return db.transaction((tx): AnnotationWriteResult => {
    if (tx.select({ id: writingAnnotation.id }).from(writingAnnotation).where(eq(writingAnnotation.id, row.id)).get() !== undefined) {
      return { ok: false, reason: 'duplicate' };
    }
    const piece = tx.select({ text: writingPiece.originalText }).from(writingPiece).where(eq(writingPiece.id, row.pieceId)).get();
    if (piece === undefined) return { ok: false, reason: 'missing' };
    if (piece.text === null) return { ok: false, reason: 'text' };
    if (row.scope === 'SPAN' && row.anchor !== null && !validAnchor(piece.text, row.anchor)) return { ok: false, reason: 'stale' };
    if (row.importKey !== null && tx.select({ id: writingAnnotation.id }).from(writingAnnotation)
      .where(and(eq(writingAnnotation.pieceId, row.pieceId), eq(writingAnnotation.importKey, row.importKey))).get() !== undefined) {
      return { ok: false, reason: 'duplicate' };
    }
    const restored = tx.insert(writingAnnotation).values(row).returning().get();
    return { ok: true, row: restored };
  }, { behavior: 'immediate' });
}
