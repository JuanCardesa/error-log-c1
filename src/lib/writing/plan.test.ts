import { describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { parseWritingImport, type WritingImport } from './contract';
import { annotationImportKey, textFingerprint } from './fingerprint';
import { ESSAY_TEXT, essayImport, uncorrectedImport } from './fixtures';
import { buildWritingImportPlan, planDigest, type StoredWriting } from './plan';
import { countWords } from './text';

const TODAY = '2026-10-15';
const t = getMessages('en');

function data(value: unknown): WritingImport {
  const result = parseWritingImport(value, TODAY, t);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

const UID = '3f0c3d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

/** Lo que quedó guardado tras la primera importación, sin corregir. */
function stored(overrides: Partial<StoredWriting> = {}): StoredWriting {
  return {
    id: 7, uid: UID, sessionId: 70, title: 'Making cities more liveable', genre: 'ESSAY',
    date: '2026-10-02', dateBasis: 'WRITTEN', taskPrompt: 'Write an essay discussing two of the measures in your notes.',
    originalText: ESSAY_TEXT, textFingerprint: textFingerprint(ESSAY_TEXT), wordCount: countWords(ESSAY_TEXT),
    wordMin: null, wordMax: null, timed: true, minutes: 80, status: 'AWAITING', corrector: null, correctedOn: null,
    bandContent: null, bandCommunicative: null, bandOrganisation: null, bandLanguage: null,
    teacherComment: null, personalNotes: null, updatedAt: '2026-10-03T10:00:00.000Z',
    annotationIds: new Set(), importKeys: new Set(), ...overrides,
  };
}

const plan = (value: unknown, saved: readonly StoredWriting[] = [], options: Partial<Parameters<typeof buildWritingImportPlan>[2]> = {}) =>
  buildWritingImportPlan(data(value), saved, { today: TODAY, ...options });

describe('crear', () => {
  it('propone una redacción nueva con el texto, la evaluación y las anotaciones colocadas', () => {
    const result = plan(essayImport());
    expect(result).toMatchObject({ decision: { mode: 'create' }, matchedBy: null, target: null, errors: [], needsDate: false });
    expect(result.values).toMatchObject({
      title: 'Making cities more liveable', genre: 'ESSAY', date: '2026-10-02', dateBasis: 'WRITTEN',
      originalText: ESSAY_TEXT, wordCount: countWords(ESSAY_TEXT), status: 'CORRECTED', corrector: 'PROFESOR',
      correctedOn: '2026-10-09', bandContent: 4, bandLanguage: 2.5, timed: true, minutes: 80,
    });
    expect(result.annotations.map((item) => item.outcome))
      .toEqual(['paragraph', 'paragraph', 'placed', 'placed', 'placed', 'placed', 'placed', 'document']);
    const improvement = result.annotations[5]?.row;
    expect(improvement?.anchor?.exact).toBe('a lot of');
    expect(improvement?.anchor?.suffix.startsWith(' residents')).toBe(true);
    expect(improvement?.quote).toBe('a lot of');
  });

  it('una anotación que no se localiza con seguridad entra sin colocar, con su cita', () => {
    const value = essayImport();
    value.annotations = [
      { kind: 'ERROR', source: 'PROFESOR', comment: 'Repeated.', target: { scope: 'SPAN', quote: 'public transport' } },
      { kind: 'ERROR', source: 'PROFESOR', comment: 'Typo.', target: { scope: 'SPAN', quote: 'bycicle', paragraph: 2 } },
    ];
    const result = plan(value);
    expect(result.annotations.map((item) => [item.outcome, item.location?.status])).toEqual([
      ['unplaced', 'ambiguous'], ['unplaced', 'notFound'],
    ]);
    expect(result.annotations[1]?.row).toMatchObject({ scope: 'SPAN', anchor: null, quote: 'bycicle', paragraph: 2 });
  });

  it('sin fecha de escritura pregunta y, mientras, usa la de corrección o la de hoy', () => {
    const value = essayImport();
    value.writing['writtenOn'] = null;
    expect(plan(value)).toMatchObject({ needsDate: true, values: { date: '2026-10-09', dateBasis: 'CORRECTED' },
      warnings: [{ code: 'dateFallback', basis: 'CORRECTED', date: '2026-10-09' }] });
    const bare = uncorrectedImport();
    bare.writing['writtenOn'] = null;
    expect(plan(bare).values).toMatchObject({ date: TODAY, dateBasis: 'IMPORTED' });
    expect(plan(bare, [], { writtenOn: null })).toMatchObject({ needsDate: false, values: { dateBasis: 'IMPORTED' } });
    expect(plan(bare, [], { writtenOn: '2026-09-30' })).toMatchObject({ needsDate: false, values: { date: '2026-09-30', dateBasis: 'WRITTEN' } });
  });

  it('deduce el estado: pendiente sin corrección; corregido con notas o marcas de la profesora, no con las de la IA', () => {
    expect(plan(uncorrectedImport()).values.status).toBe('AWAITING');
    const ai = essayImport();
    ai.assessment = { assessedBy: 'IA', scores: { content: 3 } };
    ai.annotations = [{ kind: 'IMPROVEMENT', source: 'IA', comment: 'x', target: { scope: 'DOCUMENT' } }];
    expect(plan(ai).values.status).toBe('AWAITING');
    const marked = essayImport();
    marked.assessment = {};
    marked.annotations = [{ kind: 'ERROR', source: 'PROFESOR', suggestion: 'their', target: { scope: 'SPAN', quote: 'there' } }];
    expect(plan(marked).values.status).toBe('CORRECTED');
    const declared = essayImport();
    declared.assessment['status'] = 'NOT_SUBMITTED';
    expect(plan(declared).values.status).toBe('NOT_SUBMITTED');
  });

  it('avisa si el total no cuadra con la suma o faltan criterios, sin bloquear', () => {
    const wrong = essayImport();
    wrong.assessment['total'] = 13;
    expect(plan(wrong)).toMatchObject({ errors: [], warnings: [{ code: 'totalMismatch', total: 13, sum: 12.5 }] });
    const partial = essayImport();
    partial.assessment['scores'] = { content: 4 };
    expect(plan(partial).warnings).toEqual([{ code: 'totalIncomplete', total: 12.5 }]);
  });

  it('bloquea un párrafo que no existe en el texto', () => {
    const value = essayImport();
    value.annotations = [{ kind: 'COMMENT', source: 'YO', comment: 'x', target: { scope: 'PARAGRAPH', paragraph: 5 } }];
    expect(plan(value).errors).toEqual([{ code: 'paragraphOutOfRange', index: 0, paragraph: 5, paragraphs: 4 }]);
  });

  it('no repite una anotación que llega dos veces en el mismo JSON', () => {
    const value = essayImport();
    const twice = value.annotations.slice(2, 3);
    value.annotations = [...twice, ...twice];
    expect(plan(value).annotations.map((item) => item.outcome)).toEqual(['placed', 'duplicate']);
  });

  it('conserva el id de una exportación que aquí no existe', () => {
    const value = essayImport();
    value.writing['id'] = UID;
    expect(plan(value)).toMatchObject({ decision: { mode: 'create' }, keepUid: UID });
  });
});

describe('reconocer la misma redacción', () => {
  it('por su id', () => {
    const value = essayImport();
    value.writing['id'] = UID;
    value.writing['text'] = 'A completely different transcription.';
    expect(plan(value, [stored()])).toMatchObject({ decision: { mode: 'update', uid: UID }, matchedBy: 'id', keepUid: null });
  });

  it('por la huella del texto, aunque cambien blancos, comillas o mayúsculas', () => {
    const value = essayImport();
    value.writing['text'] = ESSAY_TEXT.replace('people\'s', 'PEOPLE’S').replace('In recent', 'In  recent');
    expect(plan(value, [stored()])).toMatchObject({ decision: { mode: 'update', uid: UID }, matchedBy: 'fingerprint' });
  });

  it('por parecido: lo propone desde 0,85 y por debajo solo lo sugiere', () => {
    const close = essayImport();
    close.writing['text'] = ESSAY_TEXT.replace('goverment', 'government');
    expect(plan(close, [stored()])).toMatchObject({ decision: { mode: 'update' }, matchedBy: 'similarity' });

    const half = essayImport();
    half.writing['text'] = ESSAY_TEXT.split('\n\n').slice(0, 3).join('\n\n');
    const result = plan(half, [stored()]);
    expect(result.decision).toEqual({ mode: 'create' });
    expect(result.suggestions).toEqual([expect.objectContaining({ uid: UID })]);
    expect(result.suggestions[0]?.similarity).toBeGreaterThanOrEqual(0.6);
    expect(result.suggestions[0]?.similarity).toBeLessThan(0.85);

    const other = essayImport();
    other.writing['type'] = 'REPORT';
    expect(plan(other, [stored()]).suggestions).toEqual([]);
  });

  it('lo que elige la persona manda: crear aunque se parezca, o actualizar otra', () => {
    expect(plan(essayImport(), [stored()], { decision: { mode: 'create' } })).toMatchObject({ decision: { mode: 'create' }, target: null });
    const chosen = plan(uncorrectedImport(), [stored(), stored({ id: 8, uid: 'b1e7c2a0-0000-4000-8000-000000000000', originalText: 'Other.', textFingerprint: 'x' })],
      { decision: { mode: 'update', uid: 'b1e7c2a0-0000-4000-8000-000000000000' } });
    expect(chosen).toMatchObject({ matchedBy: 'similarity', target: { id: 8 } });
    expect(plan(essayImport(), [], { decision: { mode: 'update', uid: UID } }).errors).toEqual([{ code: 'targetMissing' }]);
  });
});

describe('actualizar con la corrección', () => {
  it('añade evaluación y anotaciones sin tocar el texto guardado', () => {
    const result = plan(essayImport(), [stored()]);
    expect(result.changes).toEqual(expect.arrayContaining([
      { field: 'status', before: 'AWAITING', after: 'CORRECTED' },
      { field: 'bandLanguage', before: null, after: 2.5 },
      { field: 'correctedOn', before: null, after: '2026-10-09' },
      { field: 'teacherComment', before: null, after: expect.stringContaining('Paragraph 3') },
    ]));
    expect(result.changes.map((change) => change.field)).not.toContain('originalText');
    expect(result.patch).not.toHaveProperty('originalText');
    expect(result.annotations.filter((item) => item.row !== null)).toHaveLength(8);
  });

  it('si la nueva transcripción difiere, conserva la guardada, avisa y ancla sobre ella', () => {
    const value = essayImport();
    value.writing['text'] = ESSAY_TEXT.replace('goverment', 'government');
    const result = plan(value, [stored()]);
    expect(result.text).toBe(ESSAY_TEXT);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'textDiffers' })]);
    expect(result.values.originalText).toBe(ESSAY_TEXT);
  });

  it('lo descriptivo solo rellena huecos; la evaluación sí se sustituye; null no borra', () => {
    const value = essayImport();
    value.writing['title'] = 'Cities — corrected';
    value.writing['taskPrompt'] = 'Another wording of the prompt.';
    value.assessment['personalNotes'] = 'From the AI.';
    value.assessment['teacherComment'] = null;
    const saved = stored({ status: 'CORRECTED', bandLanguage: 2, teacherComment: 'Kept.', personalNotes: 'Mine.',
      corrector: 'PROFESOR', correctedOn: '2026-10-09' });
    const result = plan(value, [saved]);
    expect(result.values).toMatchObject({ title: 'Making cities more liveable', taskPrompt: saved.taskPrompt,
      personalNotes: 'Mine.', teacherComment: 'Kept.', bandLanguage: 2.5 });
    expect(result.changes.map((change) => change.field)).toEqual(['bandContent', 'bandCommunicative', 'bandOrganisation', 'bandLanguage']);
  });

  it('una redacción antigua sin texto recibe la transcripción y su título', () => {
    const legacy = stored({ title: null, originalText: null, textFingerprint: null, wordCount: 236 });
    const result = plan(essayImport(), [legacy], { decision: { mode: 'update', uid: UID } });
    expect(result.values).toMatchObject({ title: 'Making cities more liveable', originalText: ESSAY_TEXT, wordCount: countWords(ESSAY_TEXT) });
    expect(result.changes.map((change) => change.field)).toEqual(expect.arrayContaining(['title', 'originalText']));
  });

  it('la fecha real de escritura sustituye a una aproximada, y la de corrección a la de importación', () => {
    const imported = stored({ date: '2026-10-12', dateBasis: 'IMPORTED' });
    expect(plan(essayImport(), [imported]).changes).toContainEqual({ field: 'date', before: '2026-10-12', after: '2026-10-02' });
    const undated = essayImport();
    undated.writing['writtenOn'] = null;
    expect(plan(undated, [imported], { writtenOn: null }).values).toMatchObject({ date: '2026-10-09', dateBasis: 'CORRECTED' });
  });

  it('bloquea una corrección anterior a la fecha guardada', () => {
    const value = essayImport();
    value.writing['writtenOn'] = null;
    value.assessment['correctedOn'] = '2026-09-01';
    expect(plan(value, [stored()], { writtenOn: null }).errors)
      .toEqual([{ code: 'correctedBeforeWritten', date: '2026-10-02', correctedOn: '2026-09-01' }]);
  });

  it('reimportar lo mismo no tiene nada que hacer y no repite anotaciones', () => {
    const value = essayImport();
    const first = plan(value, [stored()]);
    const after = stored({
      ...first.values, status: 'CORRECTED',
      importKeys: new Set(data(value).annotations.map(annotationImportKey)),
    });
    const again = plan(value, [after]);
    expect(again.nothingToDo).toBe(true);
    expect(again.annotations.every((item) => item.outcome === 'duplicate')).toBe(true);
  });

  it('reconoce por id una anotación ya existente, aunque la creara otra vía', () => {
    const value = essayImport();
    value.annotations = [{ ...value.annotations[0], id: '0b6f2a4c-1d2e-4f30-8a1b-2c3d4e5f6a7b' }];
    const result = plan(value, [stored({ annotationIds: new Set(['0b6f2a4c-1d2e-4f30-8a1b-2c3d4e5f6a7b']) })]);
    expect(result.annotations[0]?.outcome).toBe('duplicate');
  });
});

describe('planDigest', () => {
  it('es estable y cambia si cambia la redacción guardada', () => {
    const saved = stored();
    expect(planDigest(plan(essayImport(), [saved]))).toBe(planDigest(plan(essayImport(), [saved])));
    expect(planDigest(plan(essayImport(), [saved])))
      .not.toBe(planDigest(plan(essayImport(), [stored({ updatedAt: '2026-10-14T09:00:00.000Z' })])));
    expect(planDigest(plan(essayImport(), [saved])))
      .not.toBe(planDigest(plan(essayImport(), [stored({ importKeys: new Set(['hash:x']) })])));
  });
});
