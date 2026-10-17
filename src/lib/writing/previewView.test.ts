import { describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { parseWritingImport, type WritingImport } from './contract';
import { ESSAY_TEXT, essayImport } from './fixtures';
import { buildWritingImportPlan, type StoredWriting } from './plan';
import { toImportView } from './previewView';
import { countWords } from './text';

function data(value: unknown): WritingImport {
  const result = parseWritingImport(value, '2026-10-15', getMessages('en'));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

const view = (value: unknown, stored: readonly StoredWriting[] = []) => {
  const parsed = data(value);
  return toImportView(parsed, buildWritingImportPlan(parsed, stored, { today: '2026-10-15', writtenOn: null }), 'digest');
};

describe('toImportView', () => {
  it('resume el plan sin conjuntos internos ni el texto duplicado', () => {
    const result = view(essayImport());
    expect(result).toMatchObject({ digest: 'digest', decision: { mode: 'create' }, target: null, text: ESSAY_TEXT,
      wordCount: countWords(ESSAY_TEXT), writtenOnInJson: true });
    expect(result.values).not.toHaveProperty('originalText');
    expect(result.values).not.toHaveProperty('textFingerprint');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('dice qué anotaciones no se colocaron y por qué', () => {
    const value = essayImport();
    value.annotations = [
      { kind: 'ERROR', source: 'PROFESOR', comment: 'x', target: { scope: 'SPAN', quote: 'public transport' } },
      { kind: 'ERROR', source: 'PROFESOR', comment: 'x', target: { scope: 'SPAN', quote: 'bycicle', paragraph: 2 } },
      { kind: 'ERROR', source: 'PROFESOR', comment: 'x', target: { scope: 'SPAN', quote: 'goverment', occurrence: 2 } },
      { kind: 'COMMENT', source: 'YO', comment: 'x', target: { scope: 'PARAGRAPH', paragraph: 1 } },
    ];
    expect(view(value).annotations.map(({ outcome, reason, candidates, quote, paragraph }) => ({ outcome, reason, candidates, quote, paragraph }))).toEqual([
      { outcome: 'unplaced', reason: 'several', candidates: 3, quote: 'public transport', paragraph: null },
      { outcome: 'unplaced', reason: 'notFound', candidates: 0, quote: 'bycicle', paragraph: 2 },
      { outcome: 'unplaced', reason: 'contradicts', candidates: 1, quote: 'goverment', paragraph: null },
      { outcome: 'paragraph', reason: null, candidates: 0, quote: null, paragraph: 1 },
    ]);
  });

  it('una transcripción añadida a un texto antiguo se lista sin repetir el texto entero', () => {
    const legacy: StoredWriting = {
      id: 1, uid: '3f0c3d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', sessionId: 1, title: null, genre: 'ESSAY', date: '2026-10-02',
      dateBasis: 'WRITTEN', taskPrompt: null, originalText: null, textFingerprint: null, wordCount: null, wordMin: null,
      wordMax: null, timed: false, minutes: null, status: 'AWAITING', corrector: null, correctedOn: null, bandContent: null,
      bandCommunicative: null, bandOrganisation: null, bandLanguage: null, teacherComment: null, personalNotes: null,
      updatedAt: '2026-10-02T00:00:00.000Z', annotationIds: new Set(), importKeys: new Set(),
    };
    const parsed = data(essayImport());
    const result = toImportView(parsed, buildWritingImportPlan(parsed, [legacy],
      { today: '2026-10-15', decision: { mode: 'update', uid: legacy.uid } }), 'digest');
    expect(result.target).toEqual({ uid: legacy.uid, title: null, date: '2026-10-02' });
    expect(result.changes).toContainEqual({ field: 'originalText', before: false, after: true });
  });
});
