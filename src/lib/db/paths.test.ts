import { describe, expect, it } from 'vitest';

import { DB_FILE, MIGRATIONS_DIR } from './paths';

describe('rutas de la base de datos', () => {
  it('resuelve a rutas absolutas conocidas', () => {
    expect(DB_FILE).toMatch(/errorlog\.db$/);
    expect(MIGRATIONS_DIR).toMatch(/drizzle$/);
  });

  it('mantiene la base de datos fuera del arbol de fuentes', () => {
    const normalised = DB_FILE.split('\\').join('/');
    expect(normalised).not.toContain('/src/');
    expect(normalised).toContain('/data/');
  });
});
