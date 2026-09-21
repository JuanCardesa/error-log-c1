import { expect, it } from 'vitest';
import { emptyStudy, recordStudy, studyRanges, studySession } from '../src/core/study.js';
import { toJson } from '../src/core/exportable.js';
import { MAX_TRAY } from '../src/core/tray.js';
import { MAX_SESSION_IMPORT_ROWS, parseImportedBatch } from '../../../src/lib/import/errors.ts';

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
  expect(parseImportedBatch(toJson(Array.from({ length: MAX_TRAY }, () => ({ prompt: 'Error pendiente' })), session)).errors).toHaveLength(MAX_TRAY);
  expect(parseImportedBatch(toJson([], session)).errors).toEqual([]);
});
