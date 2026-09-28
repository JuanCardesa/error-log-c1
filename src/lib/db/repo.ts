import { type SQL, and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';

import { CAUSES, generatesCard, type Category, type Cause, type Confidence, type Paper, type SessionStatus, type Source } from '../domain/enums';
import { withSessionFormat } from '../domain/session';
import type { ErrorRow, SessionRow, WritingPieceRow } from '../domain/types';
import type {
  ErrorInput,
  SessionInput,
  WritingPieceInput,
} from '../validation/schemas';
import type { Db } from './client';
import { errorRow, session, sessionImportReceipt, writingPiece } from './schema';

/**
 * Acceso a datos. Aqui vive el SQL; la logica de negocio esta en queries/ y rules/,
 * que trabajan sobre `Dataset` y no saben que existe una base de datos.
 *
 * Solo servidor: importa el driver nativo. No debe alcanzar nunca a un componente
 * de cliente.
 */

export function listSessions(db: Db, limit = 50, offset = 0): SessionRow[] {
  return db.select().from(session).orderBy(desc(session.date), desc(session.id)).limit(limit).offset(offset).all().map(withSessionFormat);
}

export function countSessions(db: Db): number {
  return db.select({ n: sql<number>`count(*)` }).from(session).get()?.n ?? 0;
}

export function listOpenSessions(db: Db): SessionRow[] {
  return db
    .select()
    .from(session)
    .where(eq(session.status, 'OPEN'))
    .orderBy(desc(session.date), desc(session.id))
    .all().map(withSessionFormat);
}

export function countOpenSessions(db: Db): number {
  return db.select({ n: sql<number>`count(*)` }).from(session).where(eq(session.status, 'OPEN')).get()?.n ?? 0;
}

/** Texto de búsqueda normalizado: sin espacios alrededor y en minúsculas. */
const needle = (q: string | undefined): string => (q ?? '').trim().slice(0, 200).toLowerCase();

/** FTS5 needs three Unicode characters. Short searches retain the exact scan. */
const indexedNeedle = (q: string): boolean => [...q].length >= 3 && !q.includes('\0');
const ftsPhrase = (q: string): string => `"${q.replaceAll('"', '""')}"`;

export interface SessionSearch {
  /** Busca en la referencia y la fecha ISO. */
  readonly q?: string;
  /** Fuentes cuya etiqueta coincide con `q`: la vista traduce, el repositorio filtra. */
  readonly sources?: readonly Source[];
  readonly status?: SessionStatus;
  /** `NONE` = sin formato de examen. */
  readonly paper?: Paper | 'NONE';
  readonly order?: 'desc' | 'asc';
  readonly limit: number;
  readonly offset: number;
  /** La paleta solo muestra unos pocos resultados y no necesita el recuento global. */
  readonly includeTotal?: boolean;
}

export type SessionListRow = SessionRow & { readonly errorCount: number };

/**
 * Historial filtrado y paginado, con el número de errores de cada sesión. El filtro se
 * aplica en SQL: no se carga el historial entero para buscar en él.
 */
export function searchSessions(db: Db, filters: SessionSearch): { rows: SessionListRow[]; total: number } {
  const conditions: SQL[] = [];
  const q = needle(filters.q);
  if (q !== '') {
    const textMatches = or(
      sql`instr(lower(coalesce(${session.sourceRef}, '')), ${q}) > 0`,
      sql`instr(${session.date}, ${q}) > 0`,
    );
    const indexedMatches = indexedNeedle(q)
      ? and(sql`${session.id} IN (SELECT rowid FROM session_search_fts WHERE session_search_fts MATCH ${ftsPhrase(q)})`, textMatches)
      : textMatches;
    const matches: SQL[] = indexedMatches === undefined ? [] : [indexedMatches];
    if (filters.sources !== undefined && filters.sources.length > 0) {
      matches.push(inArray(session.source, [...filters.sources]));
    }
    const any = or(...matches);
    if (any !== undefined) conditions.push(any);
  }
  if (filters.status !== undefined) conditions.push(eq(session.status, filters.status));
  if (filters.paper === 'NONE') conditions.push(isNull(session.paper));
  else if (filters.paper !== undefined) conditions.push(eq(session.paper, filters.paper));

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const direction = filters.order === 'asc' ? asc : desc;
  // Nombres explícitos: dentro del select, Drizzle escribe las columnas sin tabla y el
  // `id` de la subconsulta se resolvería contra `error_row`.
  const errorCount = sql<number>`(select count(*) from "error_row" as e where e."session_id" = "session"."id")`;

  const rows = db
    .select({ row: session, errorCount })
    .from(session)
    .where(where)
    .orderBy(direction(session.date), direction(session.id))
    .limit(filters.limit)
    .offset(filters.offset)
    .all()
    .map(({ row, errorCount: n }) => ({ ...withSessionFormat(row), errorCount: n }));
  const total = filters.includeTotal === false ? rows.length : db.select({ n: sql<number>`count(*)` }).from(session).where(where).get()?.n ?? 0;
  return { rows, total };
}

export type AnkiFilter = 'pendiente' | 'convertida' | 'no-aplica';

export interface ErrorSearch {
  /** Busca en enunciado, respuesta propia, corrección y regla. */
  readonly q?: string;
  readonly category?: Category;
  readonly cause?: Cause;
  readonly confidence?: Confidence;
  readonly anki?: AnkiFilter;
  /** Fecha de la práctica (la de la sesión), ambos extremos incluidos. */
  readonly from?: string;
  readonly to?: string;
  /**
   * Solo sesiones con ítems contabilizados. Al llegar desde Q2 las filas tienen que
   * respaldar su numerador, que excluye Writing.
   */
  readonly withItemsOnly?: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly includeTotal?: boolean;
}

export interface ErrorWithSession {
  readonly error: ErrorRow;
  readonly session: SessionRow;
}

const CARD_CAUSES = CAUSES.filter(generatesCard);

/** Consulta transversal de errores, paginada en servidor. El esquema no cambia. */
export function searchErrors(db: Db, filters: ErrorSearch): { rows: ErrorWithSession[]; total: number } {
  const conditions: SQL[] = [];
  const q = needle(filters.q);
  if (q !== '') {
    if (indexedNeedle(q)) conditions.push(sql`${errorRow.id} IN (SELECT rowid FROM error_search_fts WHERE error_search_fts MATCH ${ftsPhrase(q)})`);
    conditions.push(sql`instr(lower(${errorRow.prompt} || ' ' || coalesce(${errorRow.myAnswer}, '') || ' ' || ${errorRow.correctAnswer} || ' ' || ${errorRow.ruleNote}), ${q}) > 0`);
  }
  if (filters.category !== undefined) conditions.push(eq(errorRow.category, filters.category));
  if (filters.cause !== undefined) conditions.push(eq(errorRow.cause, filters.cause));
  if (filters.confidence !== undefined) conditions.push(eq(errorRow.confidence, filters.confidence));
  if (filters.anki === 'pendiente') conditions.push(inArray(errorRow.cause, CARD_CAUSES), eq(errorRow.ankiAdded, false));
  if (filters.anki === 'convertida') conditions.push(eq(errorRow.ankiAdded, true));
  if (filters.anki === 'no-aplica') conditions.push(notInArray(errorRow.cause, CARD_CAUSES));
  if (filters.from !== undefined) conditions.push(sql`${session.date} >= ${filters.from}`);
  if (filters.to !== undefined) conditions.push(sql`${session.date} <= ${filters.to}`);
  if (filters.withItemsOnly === true) conditions.push(isNotNull(session.itemsTotal));

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const rows = db
    .select({ error: errorRow, session })
    .from(errorRow)
    .innerJoin(session, eq(errorRow.sessionId, session.id))
    .where(where)
    .orderBy(desc(session.date), desc(errorRow.id))
    .limit(filters.limit)
    .offset(filters.offset)
    .all()
    .map((row) => ({ error: row.error, session: withSessionFormat(row.session) }));
  const total = filters.includeTotal === false ? rows.length : db
    .select({ n: sql<number>`count(*)` })
    .from(errorRow)
    .innerJoin(session, eq(errorRow.sessionId, session.id))
    .where(where)
    .get()?.n ?? 0;
  return { rows, total };
}

export interface DeletionImpact {
  readonly errors: number;
  /** Errores con tarjeta: sus notas se quedan en Anki. */
  readonly converted: number;
  readonly hasWritingPiece: boolean;
  /** Reescrituras que perderán el vínculo con este texto. */
  readonly rewrites: number;
}

/** Todo lo que arrastra borrar una sesión, para decirlo antes de hacerlo. */
export function sessionDeletionImpact(db: Db, id: number): DeletionImpact {
  const errors = db.select({ ankiAdded: errorRow.ankiAdded }).from(errorRow).where(eq(errorRow.sessionId, id)).all();
  const piece = db.select({ id: writingPiece.id }).from(writingPiece).where(eq(writingPiece.sessionId, id)).get();
  const rewrites = piece === undefined ? 0
    : db.select({ n: sql<number>`count(*)` }).from(writingPiece).where(eq(writingPiece.rewriteOf, piece.id)).get()?.n ?? 0;
  return {
    errors: errors.length,
    converted: errors.filter((row) => row.ankiAdded).length,
    hasWritingPiece: piece !== undefined,
    rewrites,
  };
}

export function getSession(db: Db, id: number): SessionRow | null {
  const row = db.select().from(session).where(eq(session.id, id)).get();
  return row === undefined ? null : withSessionFormat(row);
}

export function createSession(db: Db, input: SessionInput): SessionRow {
  const created = db.insert(session).values(input).returning().get();
  if (created === undefined) throw new Error('No se pudo crear la sesion');
  return withSessionFormat(created);
}

export function updateSession(db: Db, id: number, input: SessionInput): boolean {
  return db.update(session).set(input).where(eq(session.id, id)).run().changes > 0;
}

export function setSessionStatus(db: Db, id: number, status: SessionStatus): void {
  db.update(session).set({ status }).where(eq(session.id, id)).run();
}

/** Borra la sesion y, en cascada, sus errores y su texto. */
export function deleteSession(db: Db, id: number): void {
  db.delete(session).where(eq(session.id, id)).run();
}

export function listErrors(db: Db, sessionId: number): ErrorRow[] {
  return db
    .select()
    .from(errorRow)
    .where(eq(errorRow.sessionId, sessionId))
    .orderBy(desc(errorRow.id))
    .all();
}

export function createError(db: Db, input: ErrorInput): ErrorRow {
  const created = db.insert(errorRow).values(input).returning().get();
  if (created === undefined) throw new Error('No se pudo crear el error');
  return created;
}

/**
 * Identidad de una fila importada: item, enunciado, respuesta y solucion, sin espacios
 * alrededor. Alta e importacion la comparten para que un mismo pegado no cuele dos veces
 * en una via y una en la otra.
 */
const fingerprint = (row: Pick<ErrorInput, 'itemRef' | 'prompt' | 'myAnswer' | 'correctAnswer'>): string =>
  JSON.stringify([row.itemRef ?? '', row.prompt, row.myAnswer ?? '', row.correctAnswer].map((value) => value.trim()));

/** Guarda la tanda completa y evita duplicar el mismo error al volver a pegarlo. */
export function importErrors(db: Db, sessionId: number, inputs: readonly ErrorInput[]) {
  return db.transaction((tx) => {
    const target = tx.select().from(session).where(eq(session.id, sessionId)).get();
    if (target === undefined) return { ok: false, message: 'Esa sesión ya no existe.' } as const;
    if (target.status !== 'OPEN') return { ok: false, message: 'La sesión está cerrada. Reábrela para importar.' } as const;

    const existing = tx.select().from(errorRow).where(eq(errorRow.sessionId, sessionId)).all();
    const seen = new Set(existing.map(fingerprint));
    let created = 0;
    for (const input of inputs) {
      const key = fingerprint(input);
      if (seen.has(key)) continue;
      tx.insert(errorRow).values({ ...input, sessionId, lateInSession: target.timed && input.lateInSession }).run();
      seen.add(key);
      created += 1;
    }
    return { ok: true, created, skipped: inputs.length - created } as const;
  });
}

/** Cabecera y filas comparten una única transacción SQLite. */
export function createSessionWithErrors(db: Db, header: SessionInput, inputs: readonly ErrorInput[], receipt?: { importId: string; payloadHash: string }) {
  return db.transaction((tx) => {
    if (receipt !== undefined) {
      const prior = tx.select().from(sessionImportReceipt).where(eq(sessionImportReceipt.importId, receipt.importId)).get();
      if (prior !== undefined) {
        if (prior.payloadHash !== receipt.payloadHash) return { ok: false, reason: 'changed' } as const;
        if (tx.select({ id: session.id }).from(session).where(eq(session.id, prior.sessionId)).get() === undefined) {
          return { ok: false, reason: 'deleted' } as const;
        }
        return { ok: true, sessionId: prior.sessionId, created: prior.created, skipped: prior.skipped, repeated: true } as const;
      }
    }
    const createdSession = tx.insert(session).values({ ...header, status: 'OPEN' }).returning().get();
    if (createdSession === undefined) throw new Error('No se pudo crear la sesión.');
    const seen = new Set<string>();
    let created = 0;
    for (const input of inputs) {
      const key = fingerprint(input);
      if (seen.has(key)) continue;
      tx.insert(errorRow).values({ ...input, sessionId: createdSession.id, lateInSession: header.timed && input.lateInSession }).run();
      seen.add(key);
      created += 1;
    }
    const skipped = inputs.length - created;
    if (receipt !== undefined) tx.insert(sessionImportReceipt).values({
      importId: receipt.importId, payloadHash: receipt.payloadHash, sessionId: createdSession.id, created, skipped,
    }).run();
    return { ok: true, sessionId: createdSession.id, created, skipped, repeated: false } as const;
  });
}

export function getError(db: Db, id: number): ErrorRow | null {
  return db.select().from(errorRow).where(eq(errorRow.id, id)).get() ?? null;
}

/**
 * Corregir una fila escribe lo que se teclea y nada mas.
 *
 * La conversion a Anki —marca, sello, vinculo y huella— no se toca desde aqui: se sella
 * al crear la nota y se deshace por su via explicita, `unmarkAnkiAdded`. Antes bastaba
 * con que el formulario no mandara `ankiAdded` para que esta funcion borrara el vinculo
 * y dejara la tarjeta huerfana en Anki. El `secs` de las versiones anteriores se conserva
 * por lo mismo: ya no se mide, asi que ninguna edicion puede sobrescribirlo.
 */
export function updateError(db: Db, id: number, input: ErrorInput): boolean {
  const { sessionId, itemRef, prompt, myAnswer, correctAnswer, cause, category,
    subcategory, confidence, lateInSession, ruleNote } = input;
  // Enumeradas y no `...input`: lo que se escribe se lee aqui, sin depender de que quien
  // llame no traiga de mas.
  return db.update(errorRow).set({ sessionId, itemRef, prompt, myAnswer, correctAnswer,
    cause, category, subcategory, confidence, lateInSession, ruleNote })
    .where(eq(errorRow.id, id)).run().changes > 0;
}

export function deleteError(db: Db, id: number): boolean {
  return db.delete(errorRow).where(eq(errorRow.id, id)).run().changes > 0;
}

export function unmarkAnkiAdded(db: Db, id: number): void {
  db.update(errorRow).set({ ankiAdded: false, ankiAddedAt: null, ankiNoteId: null, ankiContentHash: null }).where(eq(errorRow.id, id)).run();
}

/**
 * Subcategorias ya escritas, de la mas usada a la menos. Alimenta el autocompletado:
 * el spec pide sugerir sobre lo ya introducido, no un enum cerrado.
 */
export function distinctSubcategories(db: Db, limit = 50): string[] {
  const rows = db
    .select({ value: errorRow.subcategory, n: sql<number>`count(*)` })
    .from(errorRow)
    .where(and(isNotNull(errorRow.subcategory), sql`trim(${errorRow.subcategory}) <> ''`))
    .groupBy(errorRow.subcategory)
    .orderBy(sql`count(*) desc`)
    .limit(limit)
    .all();

  return rows.flatMap((row) => (row.value === null ? [] : [row.value]));
}

/** La ultima categoria usada, para preseleccionarla. Dentro de una tanda se repite mucho. */
export function lastUsedCategory(db: Db): string | null {
  const row = db
    .select({ category: errorRow.category })
    .from(errorRow)
    .orderBy(desc(errorRow.id))
    .limit(1)
    .get();
  return row?.category ?? null;
}

export function hasWritingPiece(db: Db, sessionId: number): boolean {
  const row = db
    .select({ id: writingPiece.id })
    .from(writingPiece)
    .where(eq(writingPiece.sessionId, sessionId))
    .get();
  return row !== undefined;
}

export function listWritingPieces(db: Db): WritingPieceRow[] {
  return db.select().from(writingPiece).orderBy(desc(writingPiece.date), desc(writingPiece.id)).all();
}

export function getWritingPiece(db: Db, id: number): WritingPieceRow | null {
  return db.select().from(writingPiece).where(eq(writingPiece.id, id)).get() ?? null;
}

export function createWritingPiece(db: Db, input: WritingPieceInput): WritingPieceRow {
  const created = db.insert(writingPiece).values(input).returning().get();
  if (created === undefined) throw new Error('No se pudo crear el texto');
  return created;
}

export function updateWritingPiece(db: Db, id: number, input: WritingPieceInput): void {
  db.update(writingPiece).set(input).where(eq(writingPiece.id, id)).run();
}

export function deleteWritingPiece(db: Db, id: number): void {
  db.delete(writingPiece).where(eq(writingPiece.id, id)).run();
}

/**
 * Sesiones de Writing que todavia no tienen texto. `writing_piece.session_id` es UNIQUE
 * (decision P1), asi que ofrecer una sesion ya usada solo produciria un error.
 */
export function writingSessionsWithoutPiece(db: Db): SessionRow[] {
  const taken = new Set(
    db.select({ sessionId: writingPiece.sessionId }).from(writingPiece).all().map((r) => r.sessionId),
  );
  return db
    .select()
    .from(session)
    .where(eq(session.paper, 'WRITING'))
    .orderBy(desc(session.date))
    .all()
    .filter((row) => !taken.has(row.id))
    .map(withSessionFormat);
}
