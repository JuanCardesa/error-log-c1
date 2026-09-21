import { expect, it } from 'vitest';
import { emptyStudy, normalizeStudy, recordStudy, studyRanges, studySession } from '../src/core/study.js';
import { MAX_EXPORT_LENGTH, toJson } from '../src/core/exportable.js';
import { MAX_TRAY } from '../src/core/tray.js';
import { MAX_IMPORT_LENGTH, MAX_SESSION_IMPORT_ROWS, parseImportedBatch } from '../../../src/lib/import/errors.ts';

const verdicts = new Map([['a', 'correct'], ['b', 'incorrect']]);
const context = { book: 'Ready for C1 Advanced', pages: [6], activity: '1' };

it('acumula actividades, incluidas las perfectas, sin inflar aciertos por reintentos', () => {
  let study = recordStudy(emptyStudy(), 'act-1', verdicts, context, 'first', '2026-09-20');
  study = recordStudy(study, 'act-1', new Map([['a', 'correct'], ['b', 'correct']]), context);
  study = recordStudy(study, 'act-2', new Map([['a', 'correct']]), { ...context, pages: [7], activity: '2' });
  expect(studySession(study)).toEqual({
    date: '2026-09-20', kind: 'DRILL', paper: null, part: null, source: 'LIBRO',
    sourceRef: 'Ready for C1 Advanced · págs. 6-7 · actividades 1-2', itemsTotal: 3, itemsCorrect: 2, timed: false,
  });
});

it('omite metadatos ausentes sin inventar páginas intermedias', () => {
  expect(studySession(recordStudy(emptyStudy(), 'act', verdicts)).sourceRef).toBe(null);
  expect(studyRanges([1, 2, 5, 5, 7, 8])).toBe('1-2, 5, 7-8');
  expect(studySession(emptyStudy())).toMatchObject({ itemsTotal: 0, itemsCorrect: 0 });
});

it.each([null, {}, [], 'texto', 3, { activities: 'bad' }, { activities: [{ key: 'a' }] },
  { activities: [{ key: 'a', items: [['x', 'correct']] }] }, { activities: [{ items: [], context: { pages: [] } }] }])
('descarta un estado guardado con una forma inesperada en vez de tumbar el arranque: %j', (value) => {
  expect(normalizeStudy(value)).toEqual(emptyStudy());
  expect(studySession(normalizeStudy(value))).toMatchObject({ itemsTotal: 0, itemsCorrect: 0, sourceRef: null });
});

it('conserva lo que sí encaja de un estado guardado y descarta solo la actividad rota', () => {
  const sane = recordStudy(emptyStudy(), 'act', verdicts, context, 'first', '2026-09-20');
  const mixed = { ...sane, activities: [...sane.activities, { key: 'rota', items: 'no', context: null }] };
  expect(normalizeStudy(JSON.parse(JSON.stringify(mixed)))).toEqual(sane);
});

it('conserva la primera corrección al remontar la misma actividad con ids nuevos', () => {
  const first = recordStudy(emptyStudy(), 'act', verdicts, context, 'first', '2026-09-20');
  const remounted = recordStudy(first, 'act', new Map([['new-a', 'correct'], ['new-b', 'correct']]), { ...context, pages: [7] }, 'new');
  expect(studySession(remounted)).toMatchObject({ itemsTotal: 2, itemsCorrect: 1 });
  expect(remounted.activities).toHaveLength(1);
  expect(remounted.activities[0]).toMatchObject({ items: [...verdicts], signature: 'new', context: { pages: [6, 7] } });
});

it('el JSON real del exportador hace round-trip con el importador y conserva la revisión pendiente', () => {
  const session = studySession(recordStudy(emptyStudy(), 'act-1', verdicts, context, 'first', '2026-09-20'));
  const errors = [{ prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: '', category: '', ruleNote: '' }];
  const parsed = parseImportedBatch(toJson(errors, session), '2026-09-20');
  expect(parsed.session).toEqual(session);
  expect(parsed.errors[0]).toMatchObject({ ...errors[0], cause: 'DESCONOCIMIENTO', confidence: 'DUDABA' });
  expect(parsed.session).not.toHaveProperty('durationMin');
});

it('exporta una bandeja completa en un sobre y también una tanda sin fallos', () => {
  const session = studySession(recordStudy(emptyStudy(), 'act', verdicts));
  expect(MAX_TRAY).toBe(MAX_SESSION_IMPORT_ROWS);
  expect(MAX_EXPORT_LENGTH).toBe(MAX_IMPORT_LENGTH);
  expect(parseImportedBatch(toJson(Array.from({ length: MAX_TRAY }, () => ({ prompt: 'Error pendiente' })), session)).errors).toHaveLength(MAX_TRAY);
  expect(parseImportedBatch(toJson([], session)).errors).toEqual([]);
});

it('el JSON compacto permite importar una tanda que con sangría superaría el límite', () => {
  const session = studySession(recordStudy(emptyStudy(), 'act', verdicts));
  const errors = Array.from({ length: MAX_TRAY }, () => ({
    prompt: 'x'.repeat(525), myAnswer: 'x', correctAnswer: '', category: '', ruleNote: '', subcategory: '',
  }));
  expect(JSON.stringify({ session, errors }, null, 2).length).toBeGreaterThan(MAX_IMPORT_LENGTH);
  const json = toJson(errors, session);
  expect(json.length).toBeLessThanOrEqual(MAX_IMPORT_LENGTH);
  expect(parseImportedBatch(json).errors).toHaveLength(MAX_TRAY);
});
