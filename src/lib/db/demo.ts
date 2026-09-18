import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { migrate } from './migrate';

import { createDb } from './client';
import { MIGRATIONS_DIR } from './paths';
import { seedIfEmpty } from './seedSafe';

/** Cada demostracion tiene su propia base; no usa DB_FILE_OVERRIDE ni la base personal. */
export function prepareDemo(directory: string, today: Date): string {
  mkdirSync(directory, { recursive: true });
  const file = join(mkdtempSync(join(directory, 'run-')), 'demo.db');
  const db = createDb(file);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    seedIfEmpty(db, today);
  } finally {
    db.$client.close();
  }
  return file;
}
