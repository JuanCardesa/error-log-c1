import { resolve } from 'node:path';

/**
 * Ruta del fichero SQLite. Vive fuera de git (§1): el backup es copiar este fichero.
 * `DB_FILE_OVERRIDE` existe para que los tests y los e2e usen una base desechable.
 */
export const DB_FILE: string =
  process.env['DB_FILE_OVERRIDE'] ?? resolve(process.cwd(), 'data', 'errorlog.db');

export const MIGRATIONS_DIR: string = resolve(process.cwd(), 'drizzle');
