import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createError, deleteError } from '../src/lib/db/repo';
import { E2E_DB } from './globalSetup';

test('descarga CSV con UTF-8 y respuestas tratadas como texto; el JSON conserva el original', async ({ request }) => {
  const db = createDb(E2E_DB);
  let createdId: number | undefined;
  try {
    const sample = loadDataset(db).errors[0];
    if (sample === undefined) throw new Error('Falta un error en el seed');
    const { id: _id, createdAt: _createdAt, ...input } = sample;
    const created = createError(db, {
      ...input, confidence: 'SEGURO', myAnswer: '=1+2', correctAnswer: 'corrección',
      ruleNote: 'Regla de ejemplo para comprobar los acentos.',
    });
    createdId = created.id;
    const csv = await request.get('/exportar/q4.csv');
    expect(csv.ok()).toBe(true);
    const bytes = await csv.body();
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.toString('utf8')).toContain('"\t=1+2"');
    expect(bytes.toString('utf8')).toContain('corrección');
    const json = await request.get('/exportar/dump.json');
    expect(await json.text()).toContain('"myAnswer":"=1+2"');
  } finally {
    if (createdId !== undefined) deleteError(db, createdId);
    db.$client.close();
  }
});
