import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { DB_FILE } from './paths';
import * as schema from './schema';

/**
 * Conexion a SQLite. Una sola, reutilizada: la app es local y monousuario.
 *
 * TODO(auth): sin autenticacion por diseño (§1). Si esto dejara de ser una herramienta
 * de una sola persona, aqui haria falta resolver el usuario y particionar por el.
 */

export type Db = ReturnType<typeof createDb>;

export function createDb(file: string = DB_FILE) {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }

  const sqlite = new Database(file);

  // WAL aguanta mejor lecturas concurrentes de las vistas mientras se registra.
  sqlite.pragma('journal_mode = WAL');
  // SQLite las ignora si no se piden: sin esto, ON DELETE CASCADE no se aplica.
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

let cached: Db | undefined;

export function getDb(): Db {
  cached ??= createDb();
  return cached;
}
