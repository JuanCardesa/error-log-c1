import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import type { SessionStatus } from '../domain/enums';
import { withSessionFormat } from '../domain/session';
import type { ErrorRow, SessionRow, WritingPieceRow } from '../domain/types';
import type {
  ErrorInput,
  SessionInput,
  WritingPieceInput,
} from '../validation/schemas';
import type { Db } from './client';
import { errorRow, session, writingPiece } from './schema';

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

/** Guarda la tanda completa y evita duplicar el mismo error al volver a pegarlo. */
export function importErrors(db: Db, sessionId: number, inputs: readonly ErrorInput[]) {
  return db.transaction((tx) => {
    const target = tx.select().from(session).where(eq(session.id, sessionId)).get();
    if (target === undefined) return { ok: false, message: 'Esa sesion ya no existe.' } as const;
    if (target.status !== 'OPEN') return { ok: false, message: 'La sesion esta cerrada. Reabrela para importar.' } as const;

    const fingerprint = (row: Pick<ErrorInput, 'itemRef' | 'prompt' | 'myAnswer' | 'correctAnswer'>) =>
      JSON.stringify([row.itemRef ?? '', row.prompt, row.myAnswer ?? '', row.correctAnswer].map((value) => value.trim()));
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
export function createSessionWithErrors(db: Db, header: SessionInput, inputs: readonly ErrorInput[]) {
  return db.transaction((tx) => {
    const createdSession = tx.insert(session).values({ ...header, status: 'OPEN' }).returning().get();
    if (createdSession === undefined) throw new Error('No se pudo crear la sesión.');
    const seen = new Set<string>();
    let created = 0;
    for (const input of inputs) {
      const key = JSON.stringify([input.itemRef ?? '', input.prompt, input.myAnswer ?? '', input.correctAnswer].map((text) => text.trim()));
      if (seen.has(key)) continue;
      tx.insert(errorRow).values({ ...input, sessionId: createdSession.id, lateInSession: header.timed && input.lateInSession }).run();
      seen.add(key);
      created += 1;
    }
    return { sessionId: createdSession.id, created, skipped: inputs.length - created };
  });
}

export function getError(db: Db, id: number): ErrorRow | null {
  return db.select().from(errorRow).where(eq(errorRow.id, id)).get() ?? null;
}

export function updateError(db: Db, id: number, input: ErrorInput): boolean {
  return db.update(errorRow).set({ ...input, ...(!input.ankiAdded ? { ankiNoteId: null } : {}) }).where(eq(errorRow.id, id)).run().changes > 0;
}

export function deleteError(db: Db, id: number): void {
  db.delete(errorRow).where(eq(errorRow.id, id)).run();
}

/** Sella la conversion a tarjeta. La fecha es obligatoria: hay un CHECK que lo exige. */
export function markAnkiAdded(db: Db, id: number, at: string): void {
  db.update(errorRow).set({ ankiAdded: true, ankiAddedAt: at })
    .where(and(eq(errorRow.id, id), eq(errorRow.ankiAdded, false))).run();
}

export function unmarkAnkiAdded(db: Db, id: number): void {
  db.update(errorRow).set({ ankiAdded: false, ankiAddedAt: null, ankiNoteId: null }).where(eq(errorRow.id, id)).run();
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

export function countErrors(db: Db, sessionId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(errorRow)
    .where(eq(errorRow.sessionId, sessionId))
    .get();
  return row?.n ?? 0;
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
