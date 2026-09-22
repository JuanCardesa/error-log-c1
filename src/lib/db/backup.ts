import { constants, copyFileSync, linkSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { ankiCard, ankiNote, ankiReview, ankiSync, errorRow, session, writingPiece } from './schema';

function requireNewDestination(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    if (lstatSync(`${file}${suffix}`, { throwIfNoEntry: false }) !== undefined) {
      throw new Error(`El destino ya existe: ${file}${suffix}. Elige otro nombre; no se sobrescribe nada.`);
    }
  }
}

/** Tablas presentes en todas las versiones del esquema. Identifican la base sin nombrar columnas. */
const CORE_TABLES = ['session', 'error_row', 'writing_piece'] as const;

export interface BackupOptions {
  /**
   * Exigir el esquema de esta version. Una copia previa a migrar, y una copia antigua
   * que se restaura para migrarla despues, son por definicion de un esquema anterior:
   * ahi solo cabe comprobar que el fichero es consistente y que es de Error Log.
   */
  readonly requireCurrentSchema?: boolean;
}

function checkDatabase(sqlite: Database.Database, requireCurrentSchema: boolean): void {
  if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') {
    throw new Error('La copia no supera la comprobacion de integridad de SQLite.');
  }
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new Error('La copia contiene referencias a filas inexistentes.');
  }
  for (const table of CORE_TABLES) sqlite.prepare(`SELECT 1 FROM ${table} LIMIT 0`).all();
  if (!requireCurrentSchema) return;
  // Comprueba todas las columnas que necesita esta version, sin leer datos personales.
  // El espejo de Anki entra aqui desde 0002: media migracion no la ve integrity_check.
  const db = drizzle(sqlite);
  db.select().from(session).limit(0).all();
  db.select().from(errorRow).limit(0).all();
  db.select().from(writingPiece).limit(0).all();
  db.select().from(ankiNote).limit(0).all();
  db.select().from(ankiCard).limit(0).all();
  db.select().from(ankiReview).limit(0).all();
  db.select().from(ankiSync).limit(0).all();
}

/** Un fichero que no es SQLite falla con «file is not a database»; aqui se dice cual y por que. */
function openSource(file: string): Database.Database {
  if (lstatSync(file, { throwIfNoEntry: false }) === undefined) {
    throw new Error(`No se encuentra el fichero: ${file}.`);
  }
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(file, { readonly: true, fileMustExist: true });
    // Abrir no lee la cabecera: hasta que no se consulta, un fichero cualquiera parece valido.
    sqlite.pragma('schema_version');
    return sqlite;
  } catch (error) {
    sqlite?.close();
    throw new Error(
      `${file} no es una base de datos SQLite legible (${error instanceof Error ? error.message : 'error desconocido'}).`,
    );
  }
}

/** Copia mediante la API de SQLite: incluye transacciones confirmadas en el WAL. */
export async function backupDatabase(source: string, destination: string, options: BackupOptions = {}): Promise<string> {
  const target = resolve(destination);
  requireNewDestination(target);
  const original = openSource(resolve(source));
  let scratch: string | undefined;
  try {
    mkdirSync(dirname(target), { recursive: true });
    scratch = mkdtempSync(join(dirname(target), '.errorlog-copy-'));
    const temporary = join(scratch, 'snapshot.db');
    await original.backup(temporary);

    const snapshot = new Database(temporary, { fileMustExist: true });
    try {
      // La copia entregada es un fichero independiente, sin WAL pendiente.
      snapshot.pragma('journal_mode = DELETE');
      checkDatabase(snapshot, options.requireCurrentSchema ?? true);
    } finally {
      snapshot.close();
    }

    requireNewDestination(target);
    // Publicacion atomica sin reemplazar: un destino creado entretanto hace fallar link.
    // El temporal vive en el mismo volumen que el destino.
    try {
      linkSync(temporary, target);
    } catch (error) {
      // Volumenes como FAT/exFAT no admiten enlaces duros. La copia exclusiva
      // tambien rechaza un destino creado entretanto y mantiene intacto el origen.
      const unsupported = error instanceof Error && 'code' in error
        && ['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'EINVAL'].includes(String(error.code));
      if (!unsupported) throw error;
      copyFileSync(temporary, target, constants.COPYFILE_EXCL);
    }
    return target;
  } finally {
    original.close();
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Restaurar es crear otra base validada; nunca reemplaza una base en uso.
 *
 * No se le exige el esquema de hoy: una copia antigua se restaura y se migra despues,
 * y exigirlo dejaria inservibles justo las copias que guarda `pnpm db:migrate`.
 */
export async function restoreDatabase(backup: string, destination: string): Promise<string> {
  return backupDatabase(backup, destination, { requireCurrentSchema: false });
}
