/**
 * Carga los datos de ejemplo en la base local. Destructivo: vacia las tres tablas antes.
 * Se ejecuta con `pnpm db:seed`.
 */
import { createDb } from './client';
import { DB_FILE } from './paths';
import { errorRow, session, writingPiece } from './schema';
import { seed } from './seed';

const db = createDb();

db.delete(errorRow).run();
db.delete(writingPiece).run();
db.delete(session).run();

const result = seed(db, new Date());

console.log(`Seed aplicado en ${DB_FILE}`);
console.log(
  `  ${String(result.sessions)} sesiones, ${String(result.errors)} errores, ${String(result.pieces)} textos`,
);
