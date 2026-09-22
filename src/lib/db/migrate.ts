import { readMigrationFiles } from 'drizzle-orm/migrator';

import type { Db } from './client';
import { MIGRATIONS_DIR } from './paths';

/**
 * Usa los SQL, hashes y journal de Drizzle, pero controla la transaccion: desactivar
 * foreign_keys dentro del BEGIN del migrador estandar no tiene efecto en SQLite.
 * La reconstruccion de session debe conservar sus hijos y validar antes del COMMIT.
 */
export interface MigrationState {
  /** Migraciones ya registradas: con cero, la base es nueva y no hay nada que copiar. */
  readonly applied: number;
  readonly pending: number;
}

/**
 * Cuenta lo que haria `migrate` sin tocar la base, para decidir si hace falta una copia
 * previa. Usa exactamente el mismo criterio de salto que el bucle de `migrate`: cualquier
 * diferencia entre ambos dejaria una actualizacion sin respaldo.
 */
export function migrationState(db: Db, config = { migrationsFolder: MIGRATIONS_DIR }): MigrationState {
  const sqlite = db.$client;
  const migrations = readMigrationFiles(config);
  const journal = sqlite.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
  ).get();
  if (journal === undefined) return { applied: 0, pending: migrations.length };
  const applied = sqlite.prepare<[], { total: number }>('SELECT count(*) AS total FROM __drizzle_migrations').get();
  const last = sqlite.prepare<[], { created_at: number }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  ).get();
  return {
    applied: applied?.total ?? 0,
    pending: migrations.filter((migration) => last === undefined || migration.folderMillis > last.created_at).length,
  };
}

export function migrate(db: Db, config = { migrationsFolder: MIGRATIONS_DIR }): void {
  const sqlite = db.$client;
  if (sqlite.inTransaction) throw new Error('Las migraciones requieren una conexion sin transaccion activa.');
  const migrations = readMigrationFiles(config);
  const foreignKeys = sqlite.pragma('foreign_keys', { simple: true });
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      // Mismo formato e identificacion de migraciones que el migrador de Drizzle.
      sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric
      )`);
      const last = sqlite.prepare<[], { created_at: number }>(
        'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
      ).get();
      const record = sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)');
      for (const migration of migrations) {
        if (last !== undefined && migration.folderMillis <= last.created_at) continue;
        for (const statement of migration.sql) sqlite.exec(statement);
        record.run(migration.hash, migration.folderMillis);
      }
      if (sqlite.prepare('PRAGMA foreign_key_check').all().length !== 0) {
        throw new Error('La migracion deja referencias a filas inexistentes. Se han revertido los cambios.');
      }
      if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('La migracion no supera la comprobacion de integridad. Se han revertido los cambios.');
      }
    }).immediate();
  } finally {
    sqlite.pragma(`foreign_keys = ${foreignKeys === 1 ? 'ON' : 'OFF'}`);
  }
}
