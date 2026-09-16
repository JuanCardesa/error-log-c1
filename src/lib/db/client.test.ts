import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { type Db, createDb } from './client';
import { MIGRATIONS_DIR } from './paths';

const scratch = mkdtempSync(join(tmpdir(), 'errorlog-'));
const opened: Db[] = [];

function open(file: string): Db {
  const db = createDb(file);
  opened.push(db);
  return db;
}

afterAll(() => {
  // Windows no deja borrar un fichero con el handle abierto.
  for (const db of opened) db.$client.close();
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

describe('conexion', () => {
  it('crea el directorio de la base si no existe', () => {
    const file = join(scratch, 'anidado', 'errorlog.db');
    expect(existsSync(file)).toBe(false);

    const db = open(file);
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    expect(existsSync(file)).toBe(true);
  });

  it('activa las claves ajenas, que SQLite ignora por defecto', () => {
    const db = open(':memory:');
    const [row] = db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    expect(row?.foreign_keys).toBe(1);
  });

  it('reutiliza la misma conexion entre llamadas sin abrir la base personal', async () => {
    const file = join(scratch, 'cacheada.db');
    vi.stubEnv('DB_FILE_OVERRIDE', file);
    vi.resetModules();
    const { getDb } = await import('./client');
    const first = getDb();
    expect(getDb()).toBe(first);
    expect(first.$client.name).toBe(file);
    opened.push(first);
  });
});
