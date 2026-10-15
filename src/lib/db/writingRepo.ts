import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { SOURCES, type Genre, type Source } from '../domain/enums';
import type { Messages } from '../i18n';
import { zodErrors } from '../i18n/zod';
import { isIsoDate } from '../time/dates';
import { parseWritingImport, readWritingJson, type ImportIssue, type WritingImport } from '../writing/contract';
import { contentHash } from '../writing/fingerprint';
import {
  buildWritingImportPlan,
  planDigest,
  type ImportDecision,
  type PlanError,
  type StoredWriting,
  type WritingImportPlan,
} from '../writing/plan';
import type { Db } from './client';
import { session, writingAnnotation, writingImportReceipt, writingPiece } from './schema';

/**
 * Importación de redacciones (docs/WRITING-PLAN.md §7). La vista previa no escribe nada; la
 * confirmación vuelve a leer el JSON, recalcula el plan en la misma transacción que escribe
 * y se niega a seguir si ya no coincide con lo que se vio. Solo servidor.
 */

type Reader = Pick<Db, 'select'>;

/** Las redacciones guardadas, con lo necesario para reconocerlas y no repetir anotaciones. */
export function writingImportContext(db: Reader): StoredWriting[] {
  const known = new Map<number, { ids: Set<string>; importKeys: Set<string> }>();
  const rows = db.select({ pieceId: writingAnnotation.pieceId, id: writingAnnotation.id, importKey: writingAnnotation.importKey })
    .from(writingAnnotation).all();
  for (const row of rows) {
    const entry = known.get(row.pieceId) ?? { ids: new Set<string>(), importKeys: new Set<string>() };
    entry.ids.add(row.id);
    if (row.importKey !== null) entry.importKeys.add(row.importKey);
    known.set(row.pieceId, entry);
  }
  return db.select().from(writingPiece).all().map((piece) => ({
    ...piece,
    annotationIds: known.get(piece.id)?.ids ?? new Set<string>(),
    importKeys: known.get(piece.id)?.importKeys ?? new Set<string>(),
  }));
}

/** Essay es la Part 1 del Writing de C1; el resto de tipos, la Part 2. */
export function writingPart(genre: Genre): 1 | 2 {
  return genre === 'ESSAY' ? 1 : 2;
}

function decisionSchema() {
  return z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('create') }),
    z.strictObject({ mode: z.literal('update'), uid: z.uuid() }),
  ]);
}

function writtenOnSchema(today: string, t: Messages) {
  return z.string()
    .refine(isIsoDate, { message: t.validation.invalidDate })
    .refine((value) => value <= today, { message: t.validation.futureDate })
    .nullable();
}

function previewOptionsSchema(today: string, t: Messages) {
  return z.strictObject({ decision: decisionSchema().optional(), writtenOn: writtenOnSchema(today, t).optional() });
}

function applyOptionsSchema(today: string, t: Messages) {
  return z.strictObject({
    /** Fijado al analizar: un reintento o un doble clic no crean dos redacciones. */
    importId: z.uuid(),
    decision: decisionSchema(),
    writtenOn: writtenOnSchema(today, t),
    sessionSource: z.enum(SOURCES),
    /** Una sesión Writing libre a la que enlazar la redacción, en vez de crear otra. */
    sessionId: z.number().int().positive().nullable(),
    /** El `digest` de la vista previa que se confirma. */
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  });
}

export type WritingImportApplyOptions = z.input<ReturnType<typeof applyOptionsSchema>>;

function optionIssues(error: z.ZodError): ImportIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

type Parsed = { readonly ok: true; readonly data: WritingImport } | { readonly ok: false; readonly issues: readonly ImportIssue[] };

function parseSource(source: string, today: string, t: Messages): Parsed {
  const read = readWritingJson(source, t);
  if (!read.ok) return { ok: false, issues: [{ path: '', message: read.message }] };
  return parseWritingImport(read.value, today, t);
}

export type WritingImportPreview =
  | { readonly ok: false; readonly issues: readonly ImportIssue[] }
  | { readonly ok: true; readonly data: WritingImport; readonly plan: WritingImportPlan; readonly digest: string };

export function previewWritingImport(db: Reader, source: string, rawOptions: unknown, context: {
  readonly today: string; readonly t: Messages;
}): WritingImportPreview {
  const { today, t } = context;
  const options = previewOptionsSchema(today, t).safeParse(rawOptions, { error: zodErrors(t) });
  if (!options.success) return { ok: false, issues: optionIssues(options.error) };
  const parsed = parseSource(source, today, t);
  if (!parsed.ok) return parsed;
  const plan = buildWritingImportPlan(parsed.data, writingImportContext(db), { today, ...options.data });
  return { ok: true, data: parsed.data, plan, digest: planDigest(plan) };
}

export type WritingImportResult =
  | { readonly ok: true; readonly repeated: true; readonly pieceId: number; readonly uid: string }
  | {
    readonly ok: true; readonly repeated: false; readonly pieceId: number; readonly uid: string;
    readonly mode: ImportDecision['mode']; readonly added: number; readonly skipped: number; readonly unplaced: number;
  }
  | { readonly ok: false; readonly reason: 'invalid'; readonly issues: readonly ImportIssue[] }
  | { readonly ok: false; readonly reason: 'blocked'; readonly errors: readonly PlanError[] }
  /** La redacción o sus anotaciones cambiaron desde la vista previa. */
  | { readonly ok: false; readonly reason: 'stale' }
  /** El mismo `importId` llegó antes con otro contenido. */
  | { readonly ok: false; readonly reason: 'receiptChanged' }
  /** Se importó, pero la redacción ya se borró: no se recrea. */
  | { readonly ok: false; readonly reason: 'deleted' }
  | { readonly ok: false; readonly reason: 'sessionUnavailable' };

export function applyWritingImport(db: Db, source: string, rawOptions: unknown, context: {
  readonly today: string; readonly now: Date; readonly t: Messages;
}): WritingImportResult {
  const { today, t } = context;
  const parsedOptions = applyOptionsSchema(today, t).safeParse(rawOptions, { error: zodErrors(t) });
  if (!parsedOptions.success) return { ok: false, reason: 'invalid', issues: optionIssues(parsedOptions.error) };
  const options = parsedOptions.data;
  const parsed = parseSource(source, today, t);
  if (!parsed.ok) return { ok: false, reason: 'invalid', issues: parsed.issues };
  const payloadHash = contentHash([parsed.data, options.decision, options.writtenOn, options.sessionSource, options.sessionId]);

  return db.transaction((tx): WritingImportResult => {
    const prior = tx.select().from(writingImportReceipt).where(eq(writingImportReceipt.importId, options.importId)).get();
    if (prior !== undefined) {
      if (prior.payloadHash !== payloadHash) return { ok: false, reason: 'receiptChanged' };
      const piece = tx.select({ id: writingPiece.id, uid: writingPiece.uid }).from(writingPiece)
        .where(eq(writingPiece.id, prior.pieceId)).get();
      return piece === undefined ? { ok: false, reason: 'deleted' } : { ok: true, repeated: true, pieceId: piece.id, uid: piece.uid };
    }

    const plan = buildWritingImportPlan(parsed.data, writingImportContext(tx), {
      today, decision: options.decision, writtenOn: options.writtenOn,
    });
    if (plan.errors.length > 0) return { ok: false, reason: 'blocked', errors: plan.errors };
    if (planDigest(plan) !== options.digest) return { ok: false, reason: 'stale' };

    const at = context.now.toISOString();
    const { values, target } = plan;
    let piece: { id: number; uid: string };
    if (target === null) {
      let sessionId: number;
      if (options.sessionId !== null) {
        const free = tx.select({ paper: session.paper, sourceRef: session.sourceRef }).from(session)
          .where(eq(session.id, options.sessionId)).get();
        const taken = tx.select({ id: writingPiece.id }).from(writingPiece).where(eq(writingPiece.sessionId, options.sessionId)).get();
        if (free?.paper !== 'WRITING' || taken !== undefined) return { ok: false, reason: 'sessionUnavailable' };
        // La sesión la creó la persona: solo se le pone nombre si no lo tenía.
        if (free.sourceRef === null) tx.update(session).set({ sourceRef: values.title }).where(eq(session.id, options.sessionId)).run();
        sessionId = options.sessionId;
      } else {
        sessionId = tx.insert(session).values({
          date: values.date, kind: 'WRITING', paper: 'WRITING', part: writingPart(values.genre),
          source: options.sessionSource satisfies Source, sourceRef: values.title, itemsTotal: null, itemsCorrect: null,
          durationMin: values.minutes, timed: values.timed, status: 'CLOSED',
        }).returning({ id: session.id }).get().id;
      }
      piece = tx.insert(writingPiece).values({
        ...values, sessionId, rewriteOf: null, createdAt: at, updatedAt: at,
        ...(plan.keepUid === null ? {} : { uid: plan.keepUid }),
      }).returning({ id: writingPiece.id, uid: writingPiece.uid }).get();
    } else {
      piece = { id: target.id, uid: target.uid };
      tx.update(writingPiece).set({ ...plan.patch, updatedAt: at }).where(eq(writingPiece.id, target.id)).run();
      // La sesión acompaña a su texto: misma fecha y la parte que corresponde al tipo.
      const current = tx.select({ date: session.date, part: session.part, sourceRef: session.sourceRef }).from(session)
        .where(eq(session.id, target.sessionId)).get();
      if (current !== undefined) {
        const sync = {
          ...(current.date === values.date ? {} : { date: values.date }),
          ...(current.part === writingPart(values.genre) ? {} : { part: writingPart(values.genre) }),
          ...(current.sourceRef === null && values.title !== null ? { sourceRef: values.title } : {}),
        };
        if (Object.keys(sync).length > 0) tx.update(session).set(sync).where(eq(session.id, target.sessionId)).run();
      }
    }

    const rows = plan.annotations.flatMap((item) => (item.row === null ? [] : [item.row]));
    const proposed = rows.flatMap((row) => (row.id === null ? [] : [row.id]));
    // Un id de exportación que ya existe en otra redacción no se reutiliza.
    const taken = new Set(proposed.length === 0 ? [] : tx.select({ id: writingAnnotation.id }).from(writingAnnotation)
      .where(inArray(writingAnnotation.id, proposed)).all().map((row) => row.id));
    for (const row of rows) {
      tx.insert(writingAnnotation).values({
        ...row, id: row.id !== null && !taken.has(row.id) ? row.id : randomUUID(),
        pieceId: piece.id, createdAt: at, updatedAt: at,
      }).run();
    }
    tx.insert(writingImportReceipt).values({ importId: options.importId, payloadHash, pieceId: piece.id, createdAt: at }).run();

    return {
      ok: true, repeated: false, pieceId: piece.id, uid: piece.uid, mode: plan.decision.mode,
      added: rows.length,
      skipped: plan.annotations.filter((item) => item.outcome === 'duplicate').length,
      unplaced: plan.annotations.filter((item) => item.outcome === 'unplaced').length,
    };
  }, { behavior: 'immediate' });
}
