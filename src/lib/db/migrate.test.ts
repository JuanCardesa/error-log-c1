import { migrate as standardMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createDb, type Db } from './client';
import { loadDataset } from './load';
import { migrate, migrationState } from './migrate';
import { MIGRATIONS_DIR } from './paths';
import { seed as seedCurrent } from './seed';

/** Inserta el fixture en el esquema histórico, sin usar columnas de versiones nuevas. */
function seed(target: Db, now: Date) {
  const source = createDb(':memory:');
  try {
    migrate(source);
    seedCurrent(source, now);
    for (const table of ['session', 'error_row', 'writing_piece']) {
      const columns = target.$client.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      const names = columns.map((name) => `"${name}"`).join(',');
      const insert = target.$client.prepare(`INSERT INTO ${table} (${names}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of source.$client.prepare(`SELECT ${names} FROM ${table} ORDER BY id`).raw().all()) insert.run(...row as unknown[]);
    }
  } finally { source.$client.close(); }
}

const LEGACY_PIECE_COLUMNS = ['id', 'session_id', 'date', 'genre', 'word_count', 'minutes', 'timed', 'rewrite_of',
  'corrector', 'band_content', 'band_communicative', 'band_organisation', 'band_language'].join(', ');

let db: Db;
beforeEach(() => {
  db = createDb(':memory:');
  const initial = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR })[0];
  if (initial === undefined) throw new Error('Falta la migracion inicial');
  for (const statement of initial.sql) db.$client.exec(statement);
  db.$client.exec('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)');
  db.$client.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(initial.hash, initial.folderMillis);
});
afterEach(() => db.$client.close());

function snapshot() {
  return {
    data: {
      sessions: db.$client.prepare('SELECT * FROM session ORDER BY id').all(),
      errors: db.$client.prepare<[], Record<string, unknown>>('SELECT * FROM error_row ORDER BY id').all()
        // Columnas que no existen en el esquema historico del fixture.
        .map(({ anki_note_id: _link, anki_content_hash: _hash, ...row }) => row),
      // Las columnas de 0012 no existen en el esquema historico; su relleno tiene su prueba.
      pieces: db.$client.prepare<[], { session_id: number }>(`SELECT ${LEGACY_PIECE_COLUMNS} FROM writing_piece ORDER BY id`).all(),
    },
    schema: db.$client.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(),
    journal: db.$client.prepare('SELECT * FROM __drizzle_migrations').all(),
    sequences: db.$client.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all(),
  };
}

function reserveDeletedId() {
  db.$client.exec(`INSERT INTO session (id, date, kind, paper, part, source, items_total, items_correct)
    VALUES (5000, '2020-01-01', 'DRILL', 'RUOE', 1, 'LIBRO', 1, 1);
    DELETE FROM session WHERE id = 5000;`);
}

it('migra todos los datos historicos, relaciones, indices y secuencias sin reclasificar LIBRO', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  reserveDeletedId();
  const before = snapshot();
  migrate(db);
  expect(snapshot().data).toEqual(before.data);
  expect(db.$client.prepare('SELECT count(*) AS n FROM session_search_fts').get())
    .toEqual({ n: before.data.sessions.length });
  expect(db.$client.prepare('SELECT count(*) AS n FROM error_search_fts').get())
    .toEqual({ n: before.data.errors.length });
  expect(loadDataset(db).errors.every((row) => row.ankiNoteId === null)).toBe(true);
  expect(snapshot().sequences).toEqual(before.sequences);
  expect(snapshot().schema.filter((row) => (row as { type: string }).type === 'index'))
    .toEqual(expect.arrayContaining(before.schema.filter((row) => (row as { type: string }).type === 'index')));
  expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  const firstRun = snapshot();
  migrate(db);
  expect(snapshot()).toEqual(firstRun);

  const created = db.$client.prepare(`INSERT INTO session (date, kind, paper, part, source, items_total, items_correct)
    VALUES ('2020-01-01', 'DRILL', NULL, NULL, 'LIBRO', 4, 3)`).run();
  expect(Number(created.lastInsertRowid)).toBeGreaterThan(5000);
  const writing = before.data.pieces[0];
  if (writing === undefined) throw new Error('Falta el texto del seed');
  db.$client.prepare('DELETE FROM session WHERE id = ?').run(writing.session_id);
  const afterDelete = loadDataset(db);
  expect(afterDelete.errors.some((row) => row.sessionId === writing.session_id)).toBe(false);
  expect(afterDelete.pieces.some((row) => row.sessionId === writing.session_id)).toBe(false);
  expect(db.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('conserva AUTOINCREMENT aunque todas las sesiones anteriores se hayan borrado', () => {
  reserveDeletedId();
  migrate(db);
  expect(db.$client.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'session'").get()).toEqual({ seq: 5000 });
});

it('rechaza el migrador estandar con foreign_keys activos antes de poder borrar en cascada', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  const before = snapshot();
  expect(() => standardMigrate(db, { migrationsFolder: MIGRATIONS_DIR })).toThrow(/__session_sequence/);
  expect(snapshot()).toEqual(before);
});

it('revierte esquema, datos y journal si un paper historico no cumple el nuevo contrato', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  db.$client.exec("UPDATE session SET paper = 'DESCONOCIDO' WHERE paper = 'RUOE'");
  const before = snapshot();
  expect(() => migrate(db)).toThrow(/CHECK/);
  expect(snapshot()).toEqual(before);
  expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(db.$client.prepare('SELECT name FROM sqlite_temp_schema').all()).toEqual([]);
});

it('revierte incluso despues de sustituir la tabla si encuentra una referencia rota', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  db.$client.pragma('foreign_keys = OFF');
  db.$client.exec('UPDATE error_row SET session_id = 99999 WHERE id = (SELECT min(id) FROM error_row)');
  db.$client.pragma('foreign_keys = ON');
  const before = snapshot();
  expect(() => migrate(db)).toThrow(/referencias/);
  expect(snapshot()).toEqual(before);
  expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
});

it('revierte si los CHECK de una tabla hija no superan integrity_check', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  db.$client.pragma('ignore_check_constraints = ON');
  db.$client.exec("UPDATE error_row SET rule_note = '' WHERE id = (SELECT min(id) FROM error_row)");
  db.$client.pragma('ignore_check_constraints = OFF');
  const before = snapshot();
  expect(() => migrate(db)).toThrow(/integridad/);
  expect(snapshot()).toEqual(before);
});

it('exige una transaccion propia y restaura foreign_keys si estaban desactivadas', () => {
  db.$client.transaction(() => {
    expect(() => migrate(db)).toThrow(/transaccion activa/);
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  })();
  db.$client.pragma('foreign_keys = OFF');
  migrate(db);
  expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(0);
});

it('0012 rellena los textos anteriores: uid propio, estado segun su evaluacion y alta en su fecha', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  // Un texto sin evaluar y un ID borrado por encima de todos: AUTOINCREMENT no debe reutilizarlo.
  const writingSession = () => Number(db.$client.prepare(`INSERT INTO session (date, kind, paper, part, source, items_total, items_correct)
    VALUES ('2020-01-19', 'WRITING', 'WRITING', 2, 'LIBRO', NULL, NULL)`).run().lastInsertRowid);
  const insertPiece = db.$client.prepare("INSERT INTO writing_piece (id, session_id, date, genre) VALUES (?, ?, '2020-01-19', 'REPORT')");
  insertPiece.run(900, writingSession());
  insertPiece.run(901, writingSession());
  db.$client.exec('DELETE FROM writing_piece WHERE id = 901');
  migrate(db);

  const rows = db.$client.prepare<[], Record<string, unknown>>(`SELECT id, uid, status, date, date_basis, created_at,
    updated_at, text_revision, original_text, text_fingerprint FROM writing_piece ORDER BY id`).all();
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((row) => row['uid'])).size).toBe(3);
  for (const row of rows) {
    expect(row['uid']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(row).toMatchObject({ date_basis: 'WRITTEN', text_revision: 1, original_text: null, text_fingerprint: null,
      created_at: `${String(row['date'])}T00:00:00.000Z`, updated_at: `${String(row['date'])}T00:00:00.000Z` });
  }
  // Los dos del seed tienen bandas y corrector; el nuevo, nada.
  expect(rows.map((row) => row['status'])).toEqual(['CORRECTED', 'CORRECTED', 'AWAITING']);
  expect(db.$client.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'writing_piece'").get()).toEqual({ seq: 901 });
  expect(db.$client.prepare('SELECT name FROM sqlite_temp_schema').all()).toEqual([]);

  // Ya con el esquema nuevo: medios puntos sí, otros decimales no.
  db.$client.exec('UPDATE writing_piece SET band_language = 2.5 WHERE id = 900');
  expect(() => db.$client.exec('UPDATE writing_piece SET band_language = 2.3 WHERE id = 900')).toThrow(/CHECK/);
});

it('0012 no reconstruye writing_piece con foreign_keys activos: borraria las reescrituras copiadas', () => {
  seed(db, new Date('2020-01-20T12:00:00Z'));
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
  const workspace = migrations[12];
  if (workspace === undefined) throw new Error('Falta la migracion 0012');
  db.$client.pragma('foreign_keys = OFF');
  for (const migration of migrations.slice(1, 12)) for (const statement of migration.sql) db.$client.exec(statement);
  db.$client.pragma('foreign_keys = ON');
  const before = snapshot().data;
  expect(() => db.$client.transaction(() => {
    for (const statement of workspace.sql) db.$client.exec(statement);
  })()).toThrow(/foreign_keys_off/);
  expect(snapshot().data).toEqual(before);
});

it('cuenta lo pendiente con el mismo criterio con el que migra, para decidir la copia previa', () => {
  const total = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR }).length;
  // La base del fixture tiene solo la inicial registrada.
  expect(migrationState(db)).toEqual({ applied: 1, pending: total - 1 });
  migrate(db);
  expect(migrationState(db)).toEqual({ applied: total, pending: 0 });

  // Una base nueva no tiene journal: todo pendiente y nada que copiar.
  const fresh = createDb(':memory:');
  try {
    expect(migrationState(fresh)).toEqual({ applied: 0, pending: total });
  } finally { fresh.$client.close(); }
});
