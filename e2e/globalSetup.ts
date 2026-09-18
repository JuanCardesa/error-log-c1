import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { migrate } from '../src/lib/db/migrate';

import { createDb } from '../src/lib/db/client';
import { seed } from '../src/lib/db/seed';

/**
 * Base desechable para los e2e. Se recrea en cada ejecucion para que los flujos partan
 * siempre del mismo sitio, y vive aparte de `data/errorlog.db` para no tocar los datos
 * reales de nadie.
 */
export const E2E_DB = resolve(process.cwd(), 'data', 'e2e.db');

export default function globalSetup(): void {
  rmSync(E2E_DB, { force: true });
  rmSync(`${E2E_DB}-wal`, { force: true });
  rmSync(`${E2E_DB}-shm`, { force: true });
  mkdirSync(dirname(E2E_DB), { recursive: true });

  const db = createDb(E2E_DB);
  migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  seed(db, new Date());
  db.$client.close();
}
