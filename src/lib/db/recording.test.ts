import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runRules } from '../rules';
import { q3RuoeAccuracy } from '../queries/q3RuoeAccuracy';
import { q5AnkiDebt } from '../queries/q5AnkiDebt';
import { q6RewriteEfficacy } from '../queries/q6RewriteEfficacy';
import { toIsoDate } from '../time/dates';
import { createDb } from './client';
import { loadDataset } from './load';
import { getErrorNoteLinks } from './notebookLinkRepo';
import { searchNotebookNotes } from './notebookSearch';
import { prepareRecording, recordingImport } from './recording';
import { importSessionWithErrors } from './sessionImport';

it.each(['2026-10-01', '2026-10-05', '2027-01-03'])('recording story and real import remain coherent on %s', (date) => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-recording-'));
  const now = new Date(`${date}T12:00:00`);
  const options = { now, windowDays: 30 as const };
  const state = prepareRecording(scratch, now);
  const db = createDb(state.file);
  try {
    const before = loadDataset(db);
    expect(before.sessions).toHaveLength(13);
    expect(before.errors).toHaveLength(23);
    expect(before.sessions.reduce((sum, s) => sum + (s.itemsTotal ?? 0), 0)).toBe(82);
    for (const s of before.sessions) {
      expect(s.date <= toIsoDate(now)).toBe(true);
      if (s.paper !== 'WRITING') expect(before.errors.filter((e) => e.sessionId === s.id))
        .toHaveLength(s.itemsTotal! - s.itemsCorrect!);
    }
    expect(before.errors.every((e) => e.myAnswer !== e.correctAnswer && !e.ankiAdded)).toBe(true);
    expect(q3RuoeAccuracy(before, options).weeks).toHaveLength(4);
    expect(q3RuoeAccuracy(before, options).rows.find((r) => r.part === 3)?.cells.map((c) => c?.correct)).toEqual([5, 6, 7, 8]);
    expect(q6RewriteEfficacy(before, options)).toMatchObject({ totalOriginalErrors: 3, totalRepeated: 1 });
    expect(getErrorNoteLinks(db, state.historicalErrorId)[0]?.headingStatus).toBe('valid');
    expect(searchNotebookNotes(db, { query: 'research', folderId: null, tag: null, page: 1 }).items).toHaveLength(1);
    const batch = recordingImport(now);
    batch.errors[0]!.confidence = 'SEGURO'; // Same edit as the shooting script.
    const result = importSessionWithErrors(db, batch, { today: toIsoDate(now), durationMin: null });
    expect(result.ok).toBe(true);
    const after = loadDataset(db);
    expect(after.sessions).toHaveLength(14);
    expect(after.errors).toHaveLength(26);
    expect(after.sessions.reduce((sum, s) => sum + (s.itemsTotal ?? 0), 0)).toBe(90);
    expect(q5AnkiDebt(after, options)).toMatchObject({ eligible: 25, added: 0, pending: 25 });
    expect(runRules(after, options).doNow?.id).toBe(4);
    expect(runRules(after, options).rules.find((r) => r.id === 2)).toMatchObject({ value: 5, status: 'QUEUED' });
    expect(db.$client.pragma('foreign_key_check')).toEqual([]);
    expect(JSON.parse(readFileSync(state.importFile, 'utf8'))).toEqual(recordingImport(now));
  } finally { db.$client.close(); rmSync(scratch, { recursive: true, force: true }); }
});

it('reset creates independent takes and ignores the personal override', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-recording-isolation-'));
  const personal = join(scratch, 'personal.db');
  writeFileSync(personal, 'personal sentinel');
  const previous = process.env['DB_FILE_OVERRIDE'];
  process.env['DB_FILE_OVERRIDE'] = personal;
  const now = new Date('2026-10-01T12:00:00');
  try {
    const first = prepareRecording(scratch, now);
    const db = createDb(first.file);
    try {
      importSessionWithErrors(db, recordingImport(now), { today: toIsoDate(now), durationMin: null });
      const second = prepareRecording(scratch, now);
      expect(second.file).not.toBe(first.file);
      const reset = createDb(second.file);
      try { expect(loadDataset(reset).sessions).toHaveLength(13); }
      finally { reset.$client.close(); }
      expect(loadDataset(db).sessions).toHaveLength(14);
      expect(readFileSync(personal, 'utf8')).toBe('personal sentinel');
    } finally { db.$client.close(); }
  } finally {
    if (previous === undefined) delete process.env['DB_FILE_OVERRIDE'];
    else process.env['DB_FILE_OVERRIDE'] = previous;
    rmSync(scratch, { recursive: true, force: true });
  }
});
