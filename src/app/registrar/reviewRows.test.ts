import { describe, expect, it } from 'vitest';

import type { ImportDraft } from '@/lib/import/errors';
import { missingFields, readRow, snapshotFromDraft, type RowSnapshot } from './reviewRows';

const complete: RowSnapshot = {
  itemRef: '4', prompt: 'They called ___ the meeting.', myAnswer: 'of',
  correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.',
};

describe('revision de filas pegadas', () => {
  it('detecta lo que falta en un borrador de Macmillan y solo copia los campos del resumen', () => {
    const draft: ImportDraft = {
      ...complete, correctAnswer: '', category: '', ruleNote: '',
      cause: 'DESCONOCIMIENTO', confidence: 'DUDABA', subcategory: '', lateInSession: false,
    };
    const snapshot = snapshotFromDraft(draft);
    expect(snapshot).toEqual({ ...complete, correctAnswer: '', category: '', ruleNote: '' });
    expect(missingFields(snapshot)).toEqual(['correctAnswer', 'category', 'ruleNote']);
  });

  it('no marca pendientes en una fila completa', () => {
    expect(missingFields(complete)).toEqual([]);
  });

  it('exige quince caracteres de regla sin contar espacios exteriores', () => {
    expect(missingFields({ ...complete, ruleNote: `  ${'a'.repeat(14)}  ` })).toEqual(['ruleNote']);
    expect(missingFields({ ...complete, ruleNote: 'a'.repeat(15) })).toEqual([]);
  });

  it('solo admite categorias de la taxonomia', () => {
    expect(missingFields({ ...complete, category: 'PREPOSITION' })).toEqual(['category']);
    expect(missingFields({ ...complete, category: 'LEXICO' })).toEqual([]);
  });

  it('considera pendientes las respuestas y enunciados con solo espacios', () => {
    expect(missingFields({ ...complete, correctAnswer: '  ', prompt: '\t ' })).toEqual(['correctAnswer', 'prompt']);
  });

  it('lee los seis campos por id aunque haya huecos entre las filas', () => {
    const data = new FormData();
    for (const [field, value] of Object.entries(complete)) data.set(`3.${field}`, value);
    data.set('0.correctAnswer', 'otra respuesta');
    expect(readRow(data, 3)).toEqual(complete);
  });

  it('devuelve vacio para campos ausentes o que no son texto', () => {
    const data = new FormData();
    data.set('3.correctAnswer', 'off');
    data.set('3.prompt', new Blob(['enunciado']));
    expect(readRow(data, 3)).toEqual({
      itemRef: '', prompt: '', myAnswer: '', correctAnswer: 'off', category: '', ruleNote: '',
    });
  });
});
