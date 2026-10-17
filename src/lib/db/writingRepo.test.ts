import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { ESSAY_TEXT, essayImport, uncorrectedImport } from '../writing/fixtures';
import type { ImportDecision } from '../writing/plan';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { session, writingAnnotation, writingImportReceipt, writingPiece } from './schema';
import { applyWritingImport, listWritingLibrary, previewWritingImport, type WritingImportApplyOptions } from './writingRepo';

const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T10:00:00.000Z');
const t = getMessages('es');
const UID = '3f0c3d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

let db: Db;
beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});
afterEach(() => db.$client.close());

function preview(value: unknown, options: { decision?: ImportDecision; writtenOn?: string | null } = {}) {
  const result = previewWritingImport(db, JSON.stringify(value), options, { today: TODAY, t });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** Vista previa y confirmación seguidas, como en la pantalla. */
function importNow(value: unknown, options: Partial<WritingImportApplyOptions> = {}) {
  const writtenOn = options.writtenOn ?? null;
  const seen = preview(value, { writtenOn, ...(options.decision === undefined ? {} : { decision: options.decision }) });
  return applyWritingImport(db, JSON.stringify(value), {
    importId: randomUUID(), decision: seen.plan.decision, writtenOn, sessionSource: 'ACADEMIA', sessionId: null,
    digest: seen.digest, ...options,
  }, { today: TODAY, now: NOW, t });
}

const count = (table: typeof session | typeof writingPiece | typeof writingAnnotation | typeof writingImportReceipt) =>
  db.select().from(table).all().length;

describe('vista previa', () => {
  it('no escribe nada', () => {
    const result = preview(essayImport());
    expect(result.plan.decision).toEqual({ mode: 'create' });
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
    expect([count(session), count(writingPiece), count(writingAnnotation), count(writingImportReceipt)]).toEqual([0, 0, 0, 0]);
  });

  it('devuelve los problemas del JSON y de las opciones', () => {
    expect(previewWritingImport(db, '{', {}, { today: TODAY, t })).toEqual({ ok: false, issues: [{ path: '', message: t.writingImport.notJson }] });
    expect(previewWritingImport(db, JSON.stringify(essayImport()), { writtenOn: '2026-12-01' }, { today: TODAY, t }))
      .toEqual({ ok: false, issues: [{ path: 'writtenOn', message: t.validation.futureDate }] });
  });
});

describe('importar', () => {
  it('crea la sesión, el texto exacto y las anotaciones ancladas', () => {
    const result = importNow(essayImport());
    expect(result).toMatchObject({
      ok: true, repeated: false, title: 'Making cities more liveable', mode: 'create', added: 8, skipped: 0, unplaced: 0,
    });
    if (!result.ok) return;

    const piece = db.select().from(writingPiece).where(eq(writingPiece.id, result.pieceId)).get();
    expect(piece).toMatchObject({
      uid: result.uid, title: 'Making cities more liveable', genre: 'ESSAY', date: '2026-10-02', dateBasis: 'WRITTEN',
      originalText: ESSAY_TEXT, status: 'CORRECTED', corrector: 'PROFESOR', correctedOn: '2026-10-09',
      bandContent: 4, bandLanguage: 2.5, minutes: 80, timed: true, createdAt: NOW.toISOString(), rewriteOf: null,
    });
    expect(db.select().from(session).where(eq(session.id, piece?.sessionId ?? 0)).get()).toMatchObject({
      date: '2026-10-02', kind: 'WRITING', paper: 'WRITING', part: 1, source: 'ACADEMIA',
      sourceRef: 'Making cities more liveable', itemsTotal: null, durationMin: 80, timed: true, status: 'CLOSED',
    });

    const annotations = db.select().from(writingAnnotation).all();
    expect(annotations).toHaveLength(8);
    for (const annotation of annotations.filter((row) => row.anchor !== null)) {
      const { start, end, exact } = annotation.anchor!;
      expect(ESSAY_TEXT.slice(start, end)).toBe(exact);
      expect(exact).toBe(annotation.quote);
    }
    expect(annotations.every((row) => row.importKey !== null && row.pieceId === result.pieceId)).toBe(true);
    expect(count(writingImportReceipt)).toBe(1);
  });

  it('un reintento con el mismo importId no duplica; con otro contenido se rechaza', () => {
    // La respuesta se pierde y el navegador reenvía exactamente la misma petición.
    const seen = preview(essayImport(), { writtenOn: null });
    const options = { importId: randomUUID(), decision: seen.plan.decision, writtenOn: null, sessionSource: 'ACADEMIA' as const,
      sessionId: null, digest: seen.digest };
    const send = (value: unknown) => applyWritingImport(db, JSON.stringify(value), options, { today: TODAY, now: NOW, t });
    const first = send(essayImport());
    expect(send(essayImport())).toEqual({
      ok: true, repeated: true, pieceId: first.ok ? first.pieceId : 0, uid: first.ok ? first.uid : '', title: 'Making cities more liveable',
    });
    expect([count(session), count(writingPiece), count(writingAnnotation)]).toEqual([1, 1, 8]);
    expect(send(uncorrectedImport())).toEqual({ ok: false, reason: 'receiptChanged' });
  });

  it('no recrea una redacción importada y borrada después', () => {
    const importId = randomUUID();
    const first = importNow(essayImport(), { importId });
    db.delete(writingPiece).where(eq(writingPiece.id, first.ok ? first.pieceId : 0)).run();
    expect(importNow(essayImport(), { importId })).toEqual({ ok: false, reason: 'deleted' });
  });

  it('la corrección actualiza la misma redacción, sin duplicarla, y la sesión sigue su fecha', () => {
    const draft = uncorrectedImport();
    draft.writing['writtenOn'] = null;
    const first = importNow(draft);
    expect(first).toMatchObject({ ok: true, mode: 'create', added: 0 });
    expect(db.select().from(writingPiece).get()).toMatchObject({ status: 'AWAITING', date: TODAY, dateBasis: 'IMPORTED' });

    const second = importNow(essayImport());
    expect(second).toMatchObject({ ok: true, mode: 'update', added: 8, pieceId: first.ok ? first.pieceId : 0 });
    expect([count(session), count(writingPiece)]).toEqual([1, 1]);
    expect(db.select().from(writingPiece).get()).toMatchObject({
      status: 'CORRECTED', date: '2026-10-02', dateBasis: 'WRITTEN', bandLanguage: 2.5, originalText: ESSAY_TEXT,
      updatedAt: NOW.toISOString(),
    });
    expect(db.select().from(session).get()).toMatchObject({ date: '2026-10-02', part: 1 });
  });

  it('reimportar la misma corrección no añade nada', () => {
    importNow(essayImport());
    const again = importNow(essayImport());
    expect(again).toMatchObject({ ok: true, mode: 'update', added: 0, skipped: 8 });
    expect(count(writingAnnotation)).toBe(8);
    expect(preview(essayImport()).plan.nothingToDo).toBe(true);
  });

  it('se niega si la redacción cambió entre la vista previa y la confirmación', () => {
    importNow(uncorrectedImport());
    const seen = preview(essayImport());
    db.update(writingPiece).set({ updatedAt: '2026-10-15T09:59:00.000Z' }).run();
    const result = applyWritingImport(db, JSON.stringify(essayImport()), {
      importId: randomUUID(), decision: seen.plan.decision, writtenOn: null, sessionSource: 'ACADEMIA', sessionId: null, digest: seen.digest,
    }, { today: TODAY, now: NOW, t });
    expect(result).toEqual({ ok: false, reason: 'stale' });
    expect([count(writingAnnotation), count(writingImportReceipt)]).toEqual([0, 1]);
  });

  it('si algo falla a mitad, no queda nada escrito', () => {
    db.$client.exec("CREATE TRIGGER boom BEFORE INSERT ON writing_annotation BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() => importNow(essayImport())).toThrow(/boom/);
    expect([count(session), count(writingPiece), count(writingAnnotation), count(writingImportReceipt)]).toEqual([0, 0, 0, 0]);
  });

  it('no escribe si el plan tiene errores o las opciones no valen', () => {
    const value = essayImport();
    value.annotations = [{ kind: 'COMMENT', source: 'YO', comment: 'x', target: { scope: 'PARAGRAPH', paragraph: 9 } }];
    expect(importNow(value)).toEqual({ ok: false, reason: 'blocked', errors: [{ code: 'paragraphOutOfRange', index: 0, paragraph: 9, paragraphs: 4 }] });
    expect(importNow(essayImport(), { importId: 'not-a-uuid' })).toMatchObject({ ok: false, reason: 'invalid', issues: [{ path: 'importId' }] });
    expect(count(writingPiece)).toBe(0);
  });

  it('enlaza una sesión Writing libre en vez de crear otra, y rechaza una ocupada o de otro paper', () => {
    const free = db.insert(session).values({ date: '2026-10-01', kind: 'CLASE', paper: 'WRITING', part: 2, source: 'LIBRO' })
      .returning().get();
    const result = importNow(essayImport(), { sessionId: free.id });
    expect(result).toMatchObject({ ok: true, mode: 'create' });
    expect(db.select().from(writingPiece).get()?.sessionId).toBe(free.id);
    // La sesión es de la persona: solo recibe un nombre, nada más.
    expect(db.select().from(session).get()).toMatchObject({ date: '2026-10-01', part: 2, kind: 'CLASE', sourceRef: 'Making cities more liveable' });
    expect(count(session)).toBe(1);

    const other = uncorrectedImport();
    other.writing['type'] = 'REPORT';
    other.writing['text'] = 'Introduction\n\nThe aim of this report is to evaluate the sports centre.';
    expect(importNow(other, { sessionId: free.id, decision: { mode: 'create' } })).toEqual({ ok: false, reason: 'sessionUnavailable' });
    const ruoe = db.insert(session).values({ date: '2026-10-01', kind: 'DRILL', paper: 'RUOE', part: 3, source: 'LIBRO', itemsTotal: 8, itemsCorrect: 6 })
      .returning().get();
    expect(importNow(other, { sessionId: ruoe.id })).toEqual({ ok: false, reason: 'sessionUnavailable' });
  });

  it('conserva el id de una exportación y no reutiliza un id de anotación ya usado', () => {
    const exported = essayImport();
    exported.writing['id'] = UID;
    const annotationId = '0b6f2a4c-1d2e-4f30-8a1b-2c3d4e5f6a7b';
    exported.annotations = [{ ...exported.annotations[0], id: annotationId }];
    importNow(exported);
    expect(db.select().from(writingPiece).get()?.uid).toBe(UID);
    expect(db.select().from(writingAnnotation).get()?.id).toBe(annotationId);

    const report = uncorrectedImport();
    report.writing['type'] = 'REPORT';
    report.writing['text'] = 'Introduction\n\nThe aim of this report is to evaluate the sports centre.';
    report['annotations'] = [{ id: annotationId, kind: 'COMMENT', source: 'YO', comment: 'Short.', target: { scope: 'DOCUMENT' } }];
    importNow(report);
    const ids = db.select({ id: writingAnnotation.id }).from(writingAnnotation).all().map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('el tipo cambia la parte de la sesión al actualizar', () => {
    importNow(uncorrectedImport());
    const value = essayImport();
    value.writing['type'] = 'REPORT';
    const piece = db.select().from(writingPiece).get();
    expect(importNow(value, { decision: { mode: 'update', uid: piece?.uid ?? '' } })).toMatchObject({ ok: true, mode: 'update' });
    expect(db.select().from(session).get()?.part).toBe(2);
    expect(db.select().from(writingPiece).get()?.genre).toBe('REPORT');
  });
});

describe('biblioteca', () => {
  it('lista cada redacción con su sesión y las anotaciones que quedan por estudiar', () => {
    const imported = importNow(essayImport());
    if (!imported.ok) throw new Error('La importación debía salir bien');
    const legacy = db.insert(session).values({ date: '2026-09-01', kind: 'WRITING', paper: 'WRITING', part: 2, source: 'LIBRO', sourceRef: null })
      .returning().get();
    db.insert(writingPiece).values({ sessionId: legacy.id, date: '2026-09-01', genre: 'REVIEW', wordCount: 240 }).run();
    const [first] = db.select().from(writingAnnotation).all();
    db.update(writingAnnotation).set({ reviewedAt: NOW.toISOString() }).where(eq(writingAnnotation.id, first?.id ?? '')).run();

    const rows = listWritingLibrary(db);
    expect(rows.map((row) => [row.piece.title, row.piece.originalText === null, row.pending])).toEqual(expect.arrayContaining([
      ['Making cities more liveable', false, 7],
      [null, true, 0],
    ]));
    expect(rows.find((row) => row.piece.title === null)?.session).toMatchObject({ id: legacy.id, paper: 'WRITING', part: 2, sourceRef: null });
  });
});
