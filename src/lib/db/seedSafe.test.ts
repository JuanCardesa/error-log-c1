import { migrate } from './migrate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Db, createDb } from './client';
import { loadDataset } from './load';
import { MIGRATIONS_DIR } from './paths';
import { createNotebookFolder, createNotebookNote } from './notebookRepo';
import { session } from './schema';
import { seedIfEmpty } from './seedSafe';

const TODAY = new Date('2026-09-16T12:00:00Z');
let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});
afterEach(() => db.$client.close());

describe('carga segura de ejemplos', () => {
  it('carga una base vacia y rechaza repetir sin cambiar ninguna fila', () => {
    expect(seedIfEmpty(db, TODAY).errors).toBeGreaterThan(0);
    const before = loadDataset(db);
    expect(() => seedIfEmpty(db, TODAY)).toThrow('ya contiene datos');
    expect(loadDataset(db)).toEqual(before);
  });

  it('protege una sesion del usuario aunque no tenga errores', () => {
    db.insert(session).values({
      date: '2026-09-15', kind: 'DRILL', paper: 'RUOE', part: 1,
      source: 'LIBRO', itemsTotal: 8, itemsCorrect: 8,
    }).run();
    const before = loadDataset(db);
    expect(() => seedIfEmpty(db, TODAY)).toThrow('ya contiene datos');
    expect(loadDataset(db)).toEqual(before);
  });

  it('protege una base que solo contiene una carpeta Notebook', () => {
    const folder = createNotebookFolder(db, { name: 'Grammar', parentId: null },
      '2026-09-29T07:00:00.000Z');
    expect(() => seedIfEmpty(db, TODAY)).toThrow('ya contiene datos');
    expect(db.$client.prepare('SELECT id FROM notebook_folder').all()).toEqual([{ id: folder.id }]);
    expect(db.$client.prepare('SELECT count(*) AS n FROM session').get()).toEqual({ n: 0 });
  });

  it('protege una base que solo contiene un apunte Notebook', () => {
    const note = createNotebookNote(db, {
      uid: '9c8de1e3-03e6-42ec-a098-ac0db92331d0',
      title: 'Past modal verbs', folderId: null, tags: [], contentMarkdown: '',
    }, '2026-09-29T07:00:00.000Z').note;
    expect(() => seedIfEmpty(db, TODAY)).toThrow('ya contiene datos');
    expect(db.$client.prepare('SELECT id FROM notebook_note').all()).toEqual([{ id: note.id }]);
    expect(db.$client.prepare('SELECT count(*) AS n FROM session').get()).toEqual({ n: 0 });
  });

  it('pide migrar antes de sembrar en una base sin tablas', () => {
    const vacia = createDb(':memory:');
    try {
      expect(() => seedIfEmpty(vacia, TODAY)).toThrow('pnpm db:migrate');
    } finally {
      vacia.$client.close();
    }
  });

  it('revierte toda la carga si una insercion falla a mitad', () => {
    db.$client.exec(`CREATE TRIGGER reject_error BEFORE INSERT ON error_row
      BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END`);
    expect(() => seedIfEmpty(db, TODAY)).toThrow('fallo simulado');
    expect(db.select().from(session).all()).toEqual([]);
  });
});
