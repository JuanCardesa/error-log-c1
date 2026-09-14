import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import type { SessionStatus } from '../domain/enums';
import type { ErrorRow, SessionRow } from '../domain/types';
import type { ErrorInput, SessionInput } from '../validation/schemas';
import type { Db } from './client';
import { errorRow, session, writingPiece } from './schema';

/**
 * Acceso a datos. Aqui vive el SQL; la logica de negocio esta en queries/ y rules/,
 * que trabajan sobre `Dataset` y no saben que existe una base de datos.
 *
 * Solo servidor: importa el driver nativo. No debe alcanzar nunca a un componente
 * de cliente.
 */

export function listSessions(db: Db, limit = 50): SessionRow[] {
  return db.select().from(session).orderBy(desc(session.date), desc(session.id)).limit(limit).all();
}

export function listOpenSessions(db: Db): SessionRow[] {
  return db
    .select()
    .from(session)
    .where(eq(session.status, 'OPEN'))
    .orderBy(desc(session.date), desc(session.id))
    .all();
}

export function getSession(db: Db, id: number): SessionRow | null {
  return db.select().from(session).where(eq(session.id, id)).get() ?? null;
}

export function createSession(db: Db, input: SessionInput): SessionRow {
  const created = db.insert(session).values(input).returning().get();
  if (created === undefined) throw new Error('No se pudo crear la sesion');
  return created;
}

export function updateSession(db: Db, id: number, input: SessionInput): void {
  db.update(session).set(input).where(eq(session.id, id)).run();
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

export function updateError(db: Db, id: number, input: ErrorInput): void {
  db.update(errorRow).set(input).where(eq(errorRow.id, id)).run();
}

export function deleteError(db: Db, id: number): void {
  db.delete(errorRow).where(eq(errorRow.id, id)).run();
}

/** Sella la conversion a tarjeta. La fecha es obligatoria: hay un CHECK que lo exige. */
export function markAnkiAdded(db: Db, id: number, at: string): void {
  db.update(errorRow).set({ ankiAdded: true, ankiAddedAt: at }).where(eq(errorRow.id, id)).run();
}

export function unmarkAnkiAdded(db: Db, id: number): void {
  db.update(errorRow).set({ ankiAdded: false, ankiAddedAt: null }).where(eq(errorRow.id, id)).run();
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
