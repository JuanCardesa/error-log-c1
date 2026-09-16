import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Db, createDb } from './client';
import { loadDataset } from './load';
import { MIGRATIONS_DIR } from './paths';
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
