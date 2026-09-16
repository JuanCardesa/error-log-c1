import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createDb } from './client';
import { prepareDemo } from './demo';
import { loadDataset } from './load';
import { session } from './schema';

it('abre demos independientes y conserva intacta la anterior', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-demo-'));
  const first = createDb(prepareDemo(scratch, new Date('2026-09-16T12:00:00Z')));
  try {
    first.update(session).set({ sourceRef: 'edicion en mi demo' }).run();
    const before = loadDataset(first);
    const second = createDb(prepareDemo(scratch, new Date('2026-09-16T12:00:00Z')));
    try {
      expect(second.$client.name).not.toBe(first.$client.name);
      expect(loadDataset(second).sessions.length).toBeGreaterThan(0);
      expect(loadDataset(second)).not.toEqual(before);
      expect(loadDataset(first)).toEqual(before);
    } finally { second.$client.close(); }
  } finally {
    first.$client.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
