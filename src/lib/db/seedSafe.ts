import type { Db } from './client';
import { errorRow, session, writingPiece } from './schema';
import { seed } from './seed';

const REQUIRED_TABLES = ['session', 'error_row', 'writing_piece'] as const;

/** Sin migrar, SQLite responde «no such table»; eso no le dice a nadie que le falta un paso. */
function requireMigrated(db: Db): void {
  const lookup = db.$client.prepare("select 1 from sqlite_master where type = 'table' and name = ?");
  const missing = REQUIRED_TABLES.filter((name) => lookup.get(name) === undefined);

  if (missing.length > 0) {
    throw new Error('La base aun no tiene tablas. Ejecuta pnpm db:migrate antes de cargar los ejemplos.');
  }
}

/** Reserva la escritura antes de comprobar la base; nunca mezcla ejemplos y datos. */
export function seedIfEmpty(db: Db, today: Date) {
  return db.$client.transaction(() => {
    requireMigrated(db);

    const occupied =
      db.select({ id: session.id }).from(session).limit(1).get() !== undefined ||
      db.select({ id: errorRow.id }).from(errorRow).limit(1).get() !== undefined ||
      db.select({ id: writingPiece.id }).from(writingPiece).limit(1).get() !== undefined;

    if (occupied) {
      throw new Error(
        'La base ya contiene datos. No se ha modificado nada. Usa pnpm demo para probar los ejemplos en una base separada.',
      );
    }
    return seed(db, today);
  }).immediate();
}
