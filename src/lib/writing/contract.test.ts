import { describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import { MAX_WRITING_IMPORT_LENGTH, parseWritingImport, readWritingJson } from './contract';
import { ESSAY_TEXT, essayImport, uncorrectedImport } from './fixtures';

const TODAY = '2026-10-15';
const t = getMessages('es');
const parse = (value: unknown) => parseWritingImport(value, TODAY, t);

function issues(value: unknown) {
  const result = parse(value);
  if (result.ok) throw new Error('Debía rechazarse');
  return result.issues;
}

describe('readWritingJson', () => {
  it('acepta la respuesta de la IA con su valla ```json y la marca BOM', () => {
    const json = JSON.stringify(uncorrectedImport());
    expect(readWritingJson(`\uFEFF\`\`\`json\n${json}\n\`\`\`\n`, t)).toEqual({ ok: true, value: uncorrectedImport() });
  });

  it('explica qué falla antes de validar: vacío, no es JSON o demasiado largo', () => {
    expect(readWritingJson('  \n', t)).toEqual({ ok: false, message: t.writingImport.empty });
    expect(readWritingJson('Here is your JSON: {"format": 1}', t)).toEqual({ ok: false, message: t.writingImport.notJson });
    expect(readWritingJson('x'.repeat(MAX_WRITING_IMPORT_LENGTH + 1), t))
      .toEqual({ ok: false, message: t.writingImport.tooLong(488) });
  });
});

describe('parseWritingImport', () => {
  it('acepta una redacción corregida completa', () => {
    const result = parse(essayImport());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.assessment?.scores).toEqual({ content: 4, communicativeAchievement: 3, organisation: 3, language: 2.5 });
    expect(result.data.annotations).toHaveLength(8);
    expect(result.data.annotations[3]?.target).toEqual({
      scope: 'SPAN', quote: 'dont', paragraph: 3, occurrence: null, before: null, after: null, start: null, end: null,
    });
  });

  it('acepta una sin corregir, sin evaluación ni anotaciones, y con lo opcional omitido', () => {
    const { writing } = uncorrectedImport();
    const result = parse({ format: 'error-log-writing', version: 1, writing: { title: writing['title'], type: 'REPORT', text: ESSAY_TEXT } });
    expect(result).toMatchObject({ ok: true, data: { assessment: null, annotations: [],
      writing: { id: null, writtenOn: null, taskPrompt: null, wordRange: null, timed: null, minutes: null } } });
  });

  it('conserva el texto byte a byte, salvo los saltos de Windows y los bordes', () => {
    const text = 'Dear  Sir,\n\tI’m writing “because” the goverment… café\n\nYours faithfully,';
    const value = uncorrectedImport();
    value.writing['text'] = `\r\n  ${text.replace(/\n/g, '\r\n')}\r\n`;
    const result = parse(value);
    expect(result.ok && result.data.writing.text).toBe(text);
  });

  it('trata un texto opcional vacío como no sabido', () => {
    const value = essayImport();
    value.writing['taskPrompt'] = '   ';
    value.assessment['teacherComment'] = '';
    expect(parse(value)).toMatchObject({ ok: true, data: { writing: { taskPrompt: null }, assessment: { teacherComment: null } } });
  });

  it('rechaza claves desconocidas diciendo dónde y cuáles', () => {
    const value = essayImport();
    value.writing['author'] = 'Juan';
    expect(issues(value)).toEqual([{ path: 'writing', message: t.import.unknownFields('author') }]);
  });

  it('rechaza otro formato u otra versión', () => {
    expect(issues({ ...essayImport(), format: 'notebook' })).toEqual([{ path: 'format', message: t.writingImport.wrongFormat }]);
    expect(issues({ ...essayImport(), version: 3 })).toEqual([{ path: 'version', message: t.writingImport.wrongVersion }]);
  });

  it('acepta v2 con fecha registrada y su procedencia, sin fingir que se escribió ese día', () => {
    const value = essayImport();
    value['version'] = 2;
    value.writing['writtenOn'] = null;
    value.writing['recordedDate'] = '2026-10-09';
    value.writing['dateBasis'] = 'CORRECTED';
    value.assessment['correctedOn'] = '2026-10-09';
    expect(parse(value)).toMatchObject({ ok: true, data: { writing: { writtenOn: null, recordedDate: '2026-10-09', dateBasis: 'CORRECTED' } } });

    value.writing['dateBasis'] = 'IMPORTED';
    value.writing['writtenOn'] = '2026-10-02';
    expect(issues(value).map((issue) => issue.path)).toContain('writing.recordedDate');
  });

  it('exige título, tipo y texto', () => {
    const value = uncorrectedImport();
    delete value.writing['title'];
    value.writing['type'] = 'STORY';
    value.writing['text'] = ' \n ';
    expect(issues(value).map((issue) => issue.path)).toEqual(['writing.title', 'writing.type', 'writing.text']);
  });

  it('solo admite puntuaciones de 0 a 5 en medios puntos', () => {
    const value = essayImport();
    value.assessment['scores'] = { content: 6, communicativeAchievement: 2.3, organisation: -1, language: null };
    const found = issues(value);
    expect(found.map((issue) => issue.path)).toEqual([
      'assessment.scores.content', 'assessment.scores.communicativeAchievement', 'assessment.scores.organisation',
    ]);
    expect(found[1]?.message).toBe(t.validation.halfPoints);
  });

  it('rechaza fechas futuras, inválidas o una corrección anterior a la escritura', () => {
    const future = essayImport();
    future.writing['writtenOn'] = '2026-10-16';
    future.assessment['correctedOn'] = null;
    expect(issues(future)).toEqual([{ path: 'writing.writtenOn', message: t.validation.futureDate }]);
    const invalid = essayImport();
    invalid.writing['writtenOn'] = '02/10/2026';
    expect(issues(invalid)[0]?.message).toBe(t.validation.invalidDate);
    const early = essayImport();
    early.assessment['correctedOn'] = '2026-09-30';
    expect(issues(early)).toEqual([{ path: 'assessment.correctedOn', message: t.writingImport.correctedBeforeWritten }]);
  });

  it('exige algo que estudiar en cada anotación; un acierto vale con su foco', () => {
    const value = essayImport();
    value.annotations = [
      { kind: 'ERROR', source: 'PROFESOR', target: { scope: 'DOCUMENT' } },
      { kind: 'STRENGTH', focus: 'LINKING', source: 'PROFESOR', target: { scope: 'SPAN', quote: 'as a result' } },
    ];
    expect(issues(value)).toEqual([{ path: 'annotations[0].comment', message: t.writingImport.needsContent }]);
  });

  it('valida el destino de cada anotación', () => {
    const value = essayImport();
    value.annotations = [
      { kind: 'ERROR', source: 'IA', comment: 'x', target: { scope: 'SPAN', quote: '  ' } },
      { kind: 'ERROR', source: 'IA', comment: 'x', target: { scope: 'SPAN', quote: 'dont', start: 4 } },
      { kind: 'ERROR', source: 'IA', comment: 'x', target: { scope: 'PARAGRAPH' } },
      { kind: 'ERROR', source: 'IA', comment: 'x', target: { scope: 'SENTENCE', quote: 'dont' } },
      { kind: 'ERROR', source: 'IA', comment: 'x', target: { scope: 'DOCUMENT', paragraph: 2 } },
    ];
    expect(issues(value).map((issue) => issue.path)).toEqual([
      'annotations[0].target.quote', 'annotations[1].target.end', 'annotations[2].target.paragraph',
      'annotations[3].target.scope', 'annotations[4].target',
    ]);
  });

  it('pone un tope al número de anotaciones y valida el rango de palabras', () => {
    const many = essayImport();
    many.annotations = Array.from({ length: 301 }, () => ({ kind: 'COMMENT', source: 'YO', comment: 'x', target: { scope: 'DOCUMENT' } }));
    expect(issues(many)).toEqual([{ path: 'annotations', message: t.writingImport.tooManyAnnotations(300) }]);
    const range = essayImport();
    range.writing['wordRange'] = [260, 220];
    expect(issues(range)).toEqual([{ path: 'writing.wordRange', message: t.writingImport.wordRange }]);
  });

  it('rechaza caracteres de control en el texto', () => {
    const value = uncorrectedImport();
    value.writing['text'] = 'Dear Sir,\u0007 I am writing.';
    expect(issues(value)).toEqual([{ path: 'writing.text', message: t.validation.containsControlChars }]);
  });
});
