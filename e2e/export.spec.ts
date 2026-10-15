import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createError, deleteError } from '../src/lib/db/repo';
import { applyWritingImport, previewWritingImport } from '../src/lib/db/writingRepo';
import { getMessages } from '../src/lib/i18n';
import { toIsoDate } from '../src/lib/time/dates';
import { essayImport } from '../src/lib/writing/fixtures';
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
    const writingSource = JSON.stringify(essayImport());
    const writingContext = { today: toIsoDate(new Date()), t: getMessages('es') };
    const writingPreview = previewWritingImport(db, writingSource, { decision: { mode: 'create' }, writtenOn: null }, writingContext);
    if (!writingPreview.ok) throw new Error(JSON.stringify(writingPreview.issues));
    const writingResult = applyWritingImport(db, writingSource, {
      importId: randomUUID(), decision: { mode: 'create' }, writtenOn: null,
      sessionSource: 'ACADEMIA', sessionId: null, digest: writingPreview.digest,
    }, { ...writingContext, now: new Date() });
    if (!writingResult.ok) throw new Error(JSON.stringify(writingResult));
    const csv = await request.get('/exportar/q4.csv');
    expect(csv.ok()).toBe(true);
    const bytes = await csv.body();
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.toString('utf8')).toContain('"\t=1+2"');
    expect(bytes.toString('utf8')).toContain('corrección');
    const writingResponse = await request.get(`/exportar/writing-${String(writingResult.pieceId)}.json`);
    expect(writingResponse.ok()).toBe(true);
    expect(writingResponse.headers()['content-disposition']).toContain(`writing-${String(writingResult.pieceId)}.json`);
    const writingText = await writingResponse.text();
    const writingPayload = JSON.parse(writingText) as { version: number; writing: { id: string; dateBasis: string }; annotations: unknown[] };
    expect(writingPayload).toMatchObject({ version: 2, writing: { dateBasis: 'WRITTEN' } });
    expect(writingPayload.annotations).toHaveLength(8);
    const roundTrip = previewWritingImport(db, writingText, {
      decision: { mode: 'update', uid: writingPayload.writing.id }, writtenOn: null,
    }, writingContext);
    expect(roundTrip).toMatchObject({ ok: true, plan: { nothingToDo: true } });

    const json = await request.get('/exportar/dump.json');
    const dumpText = await json.text();
    expect(dumpText).toContain('"myAnswer":"=1+2"');
    expect(JSON.parse(dumpText)).toMatchObject({ formatVersion: 4, writingAnnotations: expect.arrayContaining([expect.objectContaining({ pieceId: writingResult.pieceId })]) });
  } finally {
    if (createdId !== undefined) deleteError(db, createdId);
    db.$client.close();
  }
});
