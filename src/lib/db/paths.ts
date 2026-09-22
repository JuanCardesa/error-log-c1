import { resolve } from 'node:path';

/**
 * Ruta del fichero SQLite. Vive fuera de git (§1); pnpm db:backup crea una copia consistente.
 * `DB_FILE_OVERRIDE` permite usar una base restaurada o aislar los tests y la demo.
 */
export const DB_FILE: string =
  process.env['DB_FILE_OVERRIDE'] ?? resolve(process.cwd(), 'data', 'errorlog.db');

export const MIGRATIONS_DIR: string = resolve(process.cwd(), 'drizzle');

/** Destino de las copias: las de `pnpm db:backup` y las previas a una migracion. */
export const BACKUPS_DIR: string = resolve(process.cwd(), 'data', 'backups');
