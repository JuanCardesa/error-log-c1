import { existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type * as FileSystem from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { migrate } from './migrate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backupDatabase, restoreDatabase } from './backup';
import { type Db, createDb } from './client';
import { loadDataset } from './load';
import { MIGRATIONS_DIR } from './paths';
import { seedIfEmpty } from './seedSafe';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return { ...fs, linkSync: vi.fn(fs.linkSync) };
});

let scratch: string;
const opened: Db[] = [];

function open(file: string): Db {
  const db = createDb(file);
  opened.push(db);
  return db;
}

beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'errorlog-backup-')); });
afterEach(() => {
  for (const db of opened.splice(0)) db.$client.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe('copias y restauracion', () => {
  it('crea una copia restaurable en un volumen sin enlaces duros', async () => {
    const source = join(scratch, 'original.db');
    const db = open(source);
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    seedIfEmpty(db, new Date('2020-01-20T12:00:00Z'));
    const target = join(scratch, 'portable.db');
    vi.mocked(linkSync).mockImplementationOnce(() => { throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }); });
    await backupDatabase(source, target);
    expect(loadDataset(open(target))).toEqual(loadDataset(db));
  });

  it('no sobrescribe un destino creado durante la copia de reserva', async () => {
    const source = join(scratch, 'original.db');
    migrate(open(source), { migrationsFolder: MIGRATIONS_DIR });
    const target = join(scratch, 'concurrent.db');
    vi.mocked(linkSync).mockImplementationOnce(() => {
      writeFileSync(target, 'datos de otro proceso');
      throw Object.assign(new Error('unsupported'), { code: 'EPERM' });
    });
    await expect(backupDatabase(source, target)).rejects.toThrow();
    expect(readFileSync(target, 'utf8')).toBe('datos de otro proceso');
  });

  it('conserva el WAL confirmado, las relaciones y las migraciones en un fichero restaurable', async () => {
    const source = join(scratch, 'original.db');
    const db = open(source);
    db.$client.pragma('wal_autocheckpoint = 0');
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    seedIfEmpty(db, new Date('2026-09-16T12:00:00Z'));
    expect(existsSync(`${source}-wal`)).toBe(true);
    const before = loadDataset(db);
    const backup = join(scratch, 'copies', 'backup.db');
    await backupDatabase(source, backup);
    expect(existsSync(`${backup}-wal`)).toBe(false);
    expect(existsSync(`${backup}-shm`)).toBe(false);

    const restored = join(scratch, 'restored.db');
    await restoreDatabase(backup, restored);
    const restoredDb = open(restored);
    migrate(restoredDb, { migrationsFolder: MIGRATIONS_DIR });
    expect(loadDataset(restoredDb)).toEqual(before);
    expect(loadDataset(db)).toEqual(before);
    expect(readdirSync(join(scratch, 'copies'))).toEqual(['backup.db']);
  });

  it('rechaza un destino existente, incluido el propio origen, sin cambiar sus bytes', async () => {
    const existing = join(scratch, 'existing.db');
    writeFileSync(existing, 'datos que deben conservarse');
    const before = readFileSync(existing);
    await expect(restoreDatabase(existing, existing)).rejects.toThrow('ya existe');
    expect(readFileSync(existing)).toEqual(before);
  });

  it.each(['-wal', '-shm', '-journal'])('rechaza destinos con un archivo %s pendiente', async (suffix) => {
    const target = join(scratch, 'target.db');
    writeFileSync(`${target}${suffix}`, 'pendiente');
    await expect(restoreDatabase(join(scratch, 'missing.db'), target)).rejects.toThrow('ya existe');
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(`${target}${suffix}`, 'utf8')).toBe('pendiente');
  });

  it('no crea un origen inexistente ni publica una copia fallida', async () => {
    const source = join(scratch, 'missing.db');
    const target = join(scratch, 'target.db');
    await expect(backupDatabase(source, target)).rejects.toThrow();
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('rechaza un SQLite ajeno a Error Log y limpia solo sus temporales', async () => {
    const source = join(scratch, 'unrelated.db');
    const unrelated = new Database(source);
    unrelated.exec('CREATE TABLE example (id INTEGER)');
    unrelated.close();
    await expect(restoreDatabase(source, join(scratch, 'target.db'))).rejects.toThrow('no such table');
    expect(readdirSync(scratch)).toEqual(['unrelated.db']);
  });

  it('copiar exige el espejo de Anki completo; restaurar acepta el esquema anterior', async () => {
    // Media migracion: trae anki_note pero le falta anki_review. integrity_check no lo ve.
    const broken = join(scratch, 'media.db');
    const half = open(broken);
    migrate(half, { migrationsFolder: MIGRATIONS_DIR });
    half.$client.pragma('foreign_keys = OFF');
    half.$client.exec('DROP TABLE anki_review');
    await expect(backupDatabase(broken, join(scratch, 'roto.db'))).rejects.toThrow('no such table');
    expect(existsSync(join(scratch, 'roto.db'))).toBe(false);

    // Copia anterior al espejo: es la que guarda db:migrate, y hay que poder volver a ella.
    const legacy = join(scratch, 'anterior.db');
    const old = open(legacy);
    migrate(old, { migrationsFolder: MIGRATIONS_DIR });
    old.$client.pragma('foreign_keys = OFF');
    for (const table of ['anki_review', 'anki_card', 'anki_note', 'anki_sync']) old.$client.exec(`DROP TABLE ${table}`);
    old.$client.exec('ALTER TABLE error_row DROP COLUMN anki_note_id');
    old.$client.exec(`DELETE FROM __drizzle_migrations WHERE created_at NOT IN
      (SELECT created_at FROM __drizzle_migrations ORDER BY created_at LIMIT 2)`);
    const restored = join(scratch, 'restaurada.db');
    await restoreDatabase(legacy, restored);
    // Volver a migrarla la deja al dia: es el ciclo que sostiene la copia previa.
    const migrated = open(restored);
    migrate(migrated, { migrationsFolder: MIGRATIONS_DIR });
    expect(loadDataset(migrated).errors).toEqual([]);
    expect(migrated.$client.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'anki%' AND type = 'table'").all())
      .toHaveLength(4);
  });

  it('rechaza un fichero que no es SQLite sin dejar un destino incompleto', async () => {
    const source = join(scratch, 'invalid.db');
    writeFileSync(source, 'esto no es SQLite');
    // El mensaje nombra el fichero: «file is not a database» a secas no dice cual falla.
    await expect(restoreDatabase(source, join(scratch, 'target.db')))
      .rejects.toThrow(/invalid\.db no es una base de datos SQLite/);
    expect(readdirSync(scratch)).toEqual(['invalid.db']);
  });

  it('nombra la copia que no encuentra en lugar de fallar al abrirla', async () => {
    const source = join(scratch, 'ausente.db');
    await expect(restoreDatabase(source, join(scratch, 'target.db')))
      .rejects.toThrow(/No se encuentra el fichero: .*ausente\.db/);
    expect(readdirSync(scratch)).toEqual([]);
  });

  it.each([
    ['foreign_keys = OFF', 'UPDATE error_row SET session_id = 9999', 'referencias'],
    ['ignore_check_constraints = ON', 'UPDATE session SET items_total = -1', 'integridad'],
  ])('rechaza datos inconsistentes aunque SQLite permita abrir el fichero (%s)', async (pragma, update, message) => {
    const source = join(scratch, 'inconsistent.db');
    const db = open(source);
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    seedIfEmpty(db, new Date('2026-09-16T12:00:00Z'));
    db.$client.pragma(pragma);
    db.$client.exec(update);
    const target = join(scratch, 'target.db');
    await expect(restoreDatabase(source, target)).rejects.toThrow(message);
    expect(existsSync(target)).toBe(false);
  });
});
