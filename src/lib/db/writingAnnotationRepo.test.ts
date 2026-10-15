import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { essayImport } from '../writing/fixtures';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { writingAnnotation } from './schema';
import { applyWritingImport, previewWritingImport } from './writingRepo';
import {
  createWritingAnnotation,
  deleteWritingAnnotation,
  placeWritingAnnotation,
  restoreWritingAnnotation,
  setWritingAnnotationReviewed,
  updateWritingAnnotation,
} from './writingAnnotationRepo';

const now = new Date('2026-10-15T10:00:00.000Z');
const text = 'First paragraph has a repeated word, word.\n\nSecond paragraph is here.';
let db: Db;
let pieceId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const value = essayImport();
  value.writing['text'] = text;
  value.writing['title'] = `Annotations ${randomUUID()}`;
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

const spanInput = (start: number, end: number) => ({
  pieceId, scope: 'SPAN' as const, start, end, kind: 'ERROR' as const, focus: 'SPELLING' as const,
  source: 'YO' as const, comment: 'Check this word.', suggestion: 'word',
});

describe('anotaciones de Writing', () => {
  it('crea segmentos solapados y valida los offsets contra el texto guardado', () => {
    const firstStart = text.indexOf('word');
    const first = createWritingAnnotation(db, spanInput(firstStart, firstStart + 4), now);
    const overlap = createWritingAnnotation(db, spanInput(firstStart + 2, firstStart + 6), now);
    const invalid = createWritingAnnotation(db, spanInput(text.length - 1, text.length + 2), now);

    expect(first.ok && first.row.anchor).toMatchObject({ start: firstStart, end: firstStart + 4, exact: 'word' });
    expect(overlap.ok).toBe(true);
    expect(invalid).toEqual({ ok: false, reason: 'target' });
    expect(db.select().from(writingAnnotation).where(eq(writingAnnotation.pieceId, pieceId)).all()).toHaveLength(2);
  });

  it('crea una anotación por párrafo y otra para el documento', () => {
    const common = { kind: 'STRENGTH' as const, focus: 'CONTENT' as const, source: 'YO' as const, comment: null, suggestion: null };
    const paragraph = createWritingAnnotation(db, { ...common, pieceId, scope: 'PARAGRAPH', paragraph: 2 }, now);
    const document = createWritingAnnotation(db, { ...common, pieceId, scope: 'DOCUMENT' }, now);
    const invalid = createWritingAnnotation(db, { ...common, pieceId, scope: 'PARAGRAPH', paragraph: 3 }, now);

    expect(paragraph.ok && paragraph.row).toMatchObject({ scope: 'PARAGRAPH', paragraph: 2, anchor: null });
    expect(document.ok && document.row).toMatchObject({ scope: 'DOCUMENT', paragraph: null, anchor: null });
    expect(invalid).toEqual({ ok: false, reason: 'target' });
  });

  it('edita contenido, estudia, borra y restaura sin sobrescribir un ID existente', () => {
    const created = createWritingAnnotation(db, spanInput(0, 5), now);
    if (!created.ok) throw new Error(created.reason);
    const edited = updateWritingAnnotation(db, {
      id: created.row.id, kind: 'IMPROVEMENT', focus: 'VOCABULARY', source: 'PROFESOR',
      comment: 'Clearer wording.', suggestion: 'First sentence.',
    }, new Date(now.getTime() + 1000));
    expect(edited.ok && edited.row).toMatchObject({ kind: 'IMPROVEMENT', source: 'PROFESOR', comment: 'Clearer wording.' });

    expect(setWritingAnnotationReviewed(db, created.row.id, now.toISOString(), now)?.reviewedAt).toBe(now.toISOString());
    const removed = deleteWritingAnnotation(db, created.row.id);
    if (removed === null) throw new Error('No se borró la anotación');
    expect(restoreWritingAnnotation(db, removed)).toMatchObject({ ok: true, row: { id: removed.id } });
    expect(restoreWritingAnnotation(db, removed)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('coloca un fragmento pendiente solo sobre posiciones válidas del texto guardado', () => {
    const value = essayImport();
    value.writing['text'] = text;
    value.writing['title'] = `Unplaced ${randomUUID()}`;
    value.annotations = [{ kind: 'ERROR', focus: 'SPELLING', source: 'PROFESOR', target: { scope: 'SPAN', quote: 'absent' }, comment: 'Check.', suggestion: null }];
    const t = getMessages('en');
    const preview = previewWritingImport(db, JSON.stringify(value), { decision: { mode: 'create' }, writtenOn: null }, { today: '2026-10-15', t });
    if (!preview.ok) throw new Error(JSON.stringify(preview.issues));
    const imported = applyWritingImport(db, JSON.stringify(value), {
      importId: randomUUID(), decision: { mode: 'create' }, writtenOn: null, sessionSource: 'ACADEMIA', sessionId: null, digest: preview.digest,
    }, { today: '2026-10-15', now, t });
    if (!imported.ok) throw new Error(JSON.stringify(imported));
    const pending = db.select().from(writingAnnotation).where(eq(writingAnnotation.pieceId, imported.pieceId)).get();
    if (pending === undefined) throw new Error('Falta la anotación importada');
    const start = text.indexOf('repeated');
    const placed = placeWritingAnnotation(db, { id: pending.id, start, end: start + 'repeated'.length }, now);
    const invalid = placeWritingAnnotation(db, { id: pending.id, start: -1, end: 1 }, now);
    expect(placed.ok && placed.row.anchor).toMatchObject({ exact: 'repeated', start });
    expect(invalid).toEqual({ ok: false, reason: 'target' });
  });
});
