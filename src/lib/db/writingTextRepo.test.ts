import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { essayImport } from '../writing/fixtures';
import { countWords } from '../writing/text';
import { createWritingAnnotation } from './writingAnnotationRepo';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { writingAnnotation, writingPiece, writingTextHistory } from './schema';
import { applyWritingImport, previewWritingImport } from './writingRepo';
import { updateWritingText } from './writingTextRepo';

const now = new Date('2026-10-15T10:00:00.000Z');
const original = 'The quick brown fox jumps over the log.\n\nA stable second paragraph.\n\nA phrase before the target stays.';
let db: Db;
let pieceId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const value = essayImport();
  Object.assign(value.writing, { title: `Transcript ${randomUUID()}`, text: original });
  value.annotations = [];
  const t = getMessages('en');
  const preview = previewWritingImport(db, JSON.stringify(value), { decision: { mode: 'create' }, writtenOn: null }, { today: '2026-10-15', t });
  if (!preview.ok) throw new Error(JSON.stringify(preview.issues));
  const result = applyWritingImport(db, JSON.stringify(value), {
    importId: randomUUID(), decision: { mode: 'create' }, writtenOn: null, sessionSource: 'ACADEMIA', sessionId: null, digest: preview.digest,
  }, { today: '2026-10-15', now, t });
  if (!result.ok) throw new Error(JSON.stringify(result));
  pieceId = result.pieceId;
});

afterEach(() => db.$client.close());

function makeSpan(quote: string) {
  const start = original.indexOf(quote);
  const result = createWritingAnnotation(db, {
    pieceId, scope: 'SPAN', start, end: start + quote.length, kind: 'ERROR', focus: 'SPELLING', source: 'YO',
    comment: 'Check the transcription.', suggestion: null,
  }, now);
  if (!result.ok) throw new Error(result.reason);
  return result.row.id;
}

describe('corrección de transcripciones', () => {
  it('guarda el texto anterior y re-ancla, desancla o mueve cada apunte en una transacción', () => {
    const movedId = makeSpan('quick brown fox');
    const looseId = makeSpan('phrase before');
    const paragraph = createWritingAnnotation(db, {
      pieceId, scope: 'PARAGRAPH', paragraph: 2, kind: 'STRENGTH', focus: 'CONTENT', source: 'PROFESOR',
      comment: null, suggestion: null,
    }, now);
    if (!paragraph.ok) throw new Error(paragraph.reason);
    const newText = `Introduction added.\n\n${original.replace('phrase before', 'different wording')}`;

    const result = updateWritingText(db, pieceId, newText, new Date(now.getTime() + 1000));
    const piece = db.select().from(writingPiece).where(eq(writingPiece.id, pieceId)).get();
    const moved = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, movedId)).get();
    const loose = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, looseId)).get();
    const paragraphAfter = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, paragraph.row.id)).get();
    const history = db.select().from(writingTextHistory).where(eq(writingTextHistory.pieceId, pieceId)).all();

    expect(result).toMatchObject({ ok: true, revision: 2, wordCount: countWords(newText), placed: 1, unplaced: 1 });
    expect(piece).toMatchObject({ originalText: newText, textRevision: 2, wordCount: countWords(newText) });
    expect(piece?.textFingerprint).not.toBeNull();
    expect(moved?.anchor).toMatchObject({ exact: 'quick brown fox', start: newText.indexOf('quick brown fox') });
    expect(loose).toMatchObject({ anchor: null, quote: 'phrase before' });
    expect(paragraphAfter).toMatchObject({ scope: 'PARAGRAPH', paragraph: 3 });
    expect(history).toEqual([{ id: 1, pieceId, text: original, textRevision: 1, replacedAt: new Date(now.getTime() + 1000).toISOString() }]);
  });

  it('pasa a Por colocar una anotación de párrafo si ese párrafo desaparece', () => {
    const paragraph = createWritingAnnotation(db, {
      pieceId, scope: 'PARAGRAPH', paragraph: 3, kind: 'ERROR', focus: 'GRAMMAR', source: 'YO',
      comment: 'Needs a rewrite.', suggestion: null,
    }, now);
    if (!paragraph.ok) throw new Error(paragraph.reason);
    const result = updateWritingText(db, pieceId, 'Only one paragraph remains.', new Date(now.getTime() + 1000));
    const saved = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, paragraph.row.id)).get();
    expect(result).toMatchObject({ ok: true, unplaced: 1 });
    expect(saved).toMatchObject({ scope: 'SPAN', paragraph: null, anchor: null, quote: 'A phrase before the target stays.' });
  });

  it('sigue a su párrafo cuando se reordenan sin cambiar cuántos hay', () => {
    const paragraph = createWritingAnnotation(db, {
      pieceId, scope: 'PARAGRAPH', paragraph: 2, kind: 'STRENGTH', focus: 'CONTENT', source: 'YO',
      comment: 'Clear.', suggestion: null,
    }, now);
    if (!paragraph.ok) throw new Error(paragraph.reason);
    const swapped = 'A stable second paragraph.\n\nThe quick brown fox jumps over the log.\n\nA phrase before the target stays.';
    expect(updateWritingText(db, pieceId, swapped, new Date(now.getTime() + 1000))).toMatchObject({ ok: true, unplaced: 0 });
    const saved = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, paragraph.row.id)).get();
    expect(saved).toMatchObject({ scope: 'PARAGRAPH', paragraph: 1 });
  });

  it('conserva el sitio de un párrafo corregido mientras no cambie cuántos hay', () => {
    const paragraph = createWritingAnnotation(db, {
      pieceId, scope: 'PARAGRAPH', paragraph: 2, kind: 'ERROR', focus: 'GRAMMAR', source: 'YO',
      comment: 'Typo.', suggestion: null,
    }, now);
    if (!paragraph.ok) throw new Error(paragraph.reason);
    const edited = original.replace('A stable second paragraph.', 'A steady second paragraph.');
    expect(updateWritingText(db, pieceId, edited, new Date(now.getTime() + 1000))).toMatchObject({ ok: true, unplaced: 0 });
    const saved = db.select().from(writingAnnotation).where(eq(writingAnnotation.id, paragraph.row.id)).get();
    expect(saved).toMatchObject({ scope: 'PARAGRAPH', paragraph: 2 });
  });

  it('rechaza como conflicto un guardado hecho sobre una revisión superada', () => {
    expect(updateWritingText(db, pieceId, 'Saved from the first tab.', new Date(now.getTime() + 1000), 1))
      .toMatchObject({ ok: true, revision: 2 });
    expect(updateWritingText(db, pieceId, 'Stale draft from the second tab.', new Date(now.getTime() + 2000), 1))
      .toEqual({ ok: false, reason: 'conflict' });
    expect(db.select({ text: writingPiece.originalText }).from(writingPiece).where(eq(writingPiece.id, pieceId)).get())
      .toEqual({ text: 'Saved from the first tab.' });
  });

  it('normaliza espacios externos y no crea otra revisión si el texto no cambia', () => {
    expect(updateWritingText(db, pieceId, `  ${original}\r\n`, now)).toMatchObject({ ok: true, revision: 1 });
    expect(db.select().from(writingTextHistory).where(eq(writingTextHistory.pieceId, pieceId)).all()).toHaveLength(0);
    expect(updateWritingText(db, pieceId, '  A new corrected text.  ', new Date(now.getTime() + 1000)))
      .toMatchObject({ ok: true, revision: 2, wordCount: 4 });
    expect(db.select().from(writingTextHistory).where(eq(writingTextHistory.pieceId, pieceId)).all()).toHaveLength(1);
  });

  it('añade una primera transcripción a un texto histórico sin transcripción', () => {
    db.update(writingPiece).set({ originalText: null, textFingerprint: null, wordCount: null }).where(eq(writingPiece.id, pieceId)).run();
    expect(updateWritingText(db, pieceId, 'First transcription.', now)).toMatchObject({ ok: true, revision: 2, wordCount: 2 });
    expect(db.select().from(writingTextHistory).where(eq(writingTextHistory.pieceId, pieceId)).all()).toHaveLength(0);
  });
});
