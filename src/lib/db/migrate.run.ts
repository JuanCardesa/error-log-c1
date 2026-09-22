import { join } from 'node:path';

import { backupDatabase } from './backup';
import { createDb } from './client';
import { migrate, migrationState } from './migrate';
import { BACKUPS_DIR, DB_FILE, MIGRATIONS_DIR } from './paths';

/**
 * Actualiza el esquema. Una base que ya tiene migraciones aplicadas se copia antes de
 * tocarla: la migracion es atomica, pero no reversible, y no hay migraciones `down`.
 * Si la copia falla no se migra, porque entonces no habria a donde volver.
 */
try {
  const db = createDb();
  try {
    const { applied, pending } = migrationState(db);
    if (pending === 0) {
      console.log(`Sin migraciones pendientes: ${DB_FILE}`);
    } else {
      if (applied > 0) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        // La base aun tiene el esquema anterior: exigirle el de hoy impediria copiarla.
        const copy = await backupDatabase(DB_FILE, join(BACKUPS_DIR, `previa-a-migrar-${stamp}.db`),
          { requireCurrentSchema: false });
        console.log(`Copia previa verificada: ${copy}`);
      }
      migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      console.log(`Base preparada: ${DB_FILE} (${String(pending)} migracion${pending === 1 ? '' : 'es'}).`);
    }
  } finally {
    db.$client.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudieron aplicar las migraciones.');
  process.exitCode = 1;
}
