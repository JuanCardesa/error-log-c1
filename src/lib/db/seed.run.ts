/**
 * Carga los datos de ejemplo solo si la base local esta vacia.
 * Se ejecuta con `pnpm db:seed`.
 */
import { createDb } from './client';
import { DB_FILE } from './paths';
import { seedIfEmpty } from './seedSafe';

const db = createDb();

try {
  const result = seedIfEmpty(db, new Date());
  console.log(`Ejemplos guardados en ${DB_FILE}`);
  console.log(
    `  ${String(result.sessions)} sesiones, ${String(result.errors)} errores, ${String(result.pieces)} textos`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudieron cargar los ejemplos.');
  process.exitCode = 1;
} finally {
  db.$client.close();
}
