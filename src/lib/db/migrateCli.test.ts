import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createDb } from './client';
import { loadDataset } from './load';
import { seedIfEmpty } from './seedSafe';

it('prepara una instalacion vacia y conserva los datos al migrar de nuevo', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-first-run-'));
  const file = join(scratch, 'carpeta nueva', 'data', 'errorlog.db');
  const migrate = () => spawnSync(process.execPath, [
    '--import', 'tsx', 'src/lib/db/migrate.run.ts',
  ], { env: { ...process.env, DB_FILE_OVERRIDE: file }, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  try {
    const first = migrate();
    expect(first.status, first.stderr).toBe(0);
    const db = createDb(file);
    let before;
    try {
      seedIfEmpty(db, new Date('2020-01-20T12:00:00Z'));
      before = loadDataset(db);
    } finally { db.$client.close(); }
    const second = migrate();
    expect(second.status, second.stderr).toBe(0);
    const reopened = createDb(file);
    try { expect(loadDataset(reopened)).toEqual(before); }
    finally { reopened.$client.close(); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}, 30_000);
