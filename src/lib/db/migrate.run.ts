import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { createDb } from './client';
import { DB_FILE, MIGRATIONS_DIR } from './paths';

try {
  const db = createDb();
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log(`Base preparada: ${DB_FILE}`);
  } finally {
    db.$client.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudieron aplicar las migraciones.');
  process.exitCode = 1;
}
