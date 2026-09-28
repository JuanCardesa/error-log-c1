import { mkdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type nextFactory from 'next';

import { migrate } from '../src/lib/db/migrate';

import { createDb } from '../src/lib/db/client';
import { seed } from '../src/lib/db/seed';
import { FAKE_ANKI_URL, startFakeAnki } from './fakeAnki';

/**
 * Base desechable para los e2e. Se recrea en cada ejecucion para que los flujos partan
 * siempre del mismo sitio, y vive aparte de `data/errorlog.db` para no tocar los datos
 * reales de nadie.
 */
export const E2E_DB = resolve(process.cwd(), 'data', 'e2e.db');

const APP_PORT = 3210;
const requireNext = createRequire(import.meta.url);

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve(); });
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  rmSync(E2E_DB, { force: true });
  rmSync(`${E2E_DB}-wal`, { force: true });
  rmSync(`${E2E_DB}-shm`, { force: true });
  mkdirSync(dirname(E2E_DB), { recursive: true });

  const db = createDb(E2E_DB);
  migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  seed(db, new Date());
  db.$client.close();

  // Playwright's webServer teardown waits indefinitely for taskkill in this Windows setup.
  // Start the disposable servers here and close their handles in the returned teardown.
  process.env['DB_FILE_OVERRIDE'] = E2E_DB;
  process.env['ERRORLOG_E2E'] = '1';
  process.env['ERRORLOG_ANKI_FAKE_URL'] = FAKE_ANKI_URL;
  const fakeAnki = await startFakeAnki();
  const next = requireNext('next') as typeof nextFactory;
  const app = next({ dev: false, hostname: '127.0.0.1', port: APP_PORT });
  let server: Server | undefined;
  try {
    await app.prepare();
    const handle = app.getRequestHandler();
    server = createServer((request, response) => { void handle(request, response); });
    await new Promise<void>((done, fail) => {
      server?.once('error', fail);
      server?.listen(APP_PORT, '127.0.0.1', done);
    });
  } catch (error) {
    await app.close();
    await closeServer(fakeAnki);
    throw error;
  }
  return async () => {
    await closeServer(server);
    await app.close();
    await closeServer(fakeAnki);
  };
}
