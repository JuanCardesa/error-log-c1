import { describe, expect, it } from 'vitest';

import type { ImportDraft } from '@/lib/import/errors';
import { buildImportPayload, missingFields, readRow, snapshotFromDraft, type RowSnapshot } from './reviewRows';

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

describe('contrato del envio de una tanda', () => {
  const header = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: 'Sobre', itemsTotal: 8, itemsCorrect: 6, timed: false } as const;

  /** Formulario de revision con las filas 0, 1 y 2; la 1 lleva «al final de la sesion». */
  const reviewForm = (): FormData => {
    const data = new FormData();
    for (const id of [0, 1, 2]) {
      data.set(`${String(id)}.itemRef`, String(id + 4));
      data.set(`${String(id)}.prompt`, `Enunciado ${String(id)}`);
      data.set(`${String(id)}.myAnswer`, 'of');
      data.set(`${String(id)}.correctAnswer`, 'off');
      data.set(`${String(id)}.cause`, 'CONFUSION');
      data.set(`${String(id)}.category`, 'PHRASAL_VERB');
      data.set(`${String(id)}.subcategory`, '');
      data.set(`${String(id)}.confidence`, 'SEGURO');
      data.set(`${String(id)}.ruleNote`, `Regla suficientemente larga ${String(id)}`);
    }
    data.set('1.lateInSession', 'on');
    return data;
  };

  const json = (payload: FormData, key: string): unknown => JSON.parse(String(payload.get(key)));

  it('sin cabecera envia rows con los nombres de cada campo y solo las filas que quedan', () => {
    // La fila 0 se quito de la tanda: su id ya no esta entre los enviados.
    const payload = buildImportPayload(reviewForm(), [1, 2], { targetId: 7, importedHeader: undefined });
    expect(payload.get('sessionId')).toBe('7');
    expect(payload.has('envelope')).toBe(false);
    expect(json(payload, 'rows')).toEqual([
      { itemRef: '5', prompt: 'Enunciado 1', myAnswer: 'of', correctAnswer: 'off', cause: 'CONFUSION', category: 'PHRASAL_VERB', subcategory: '', confidence: 'SEGURO', ruleNote: 'Regla suficientemente larga 1', lateInSession: true },
      { itemRef: '6', prompt: 'Enunciado 2', myAnswer: 'of', correctAnswer: 'off', cause: 'CONFUSION', category: 'PHRASAL_VERB', subcategory: '', confidence: 'SEGURO', ruleNote: 'Regla suficientemente larga 2', lateInSession: false },
    ]);
  });

  it('sin destino crea la sesion con la cabecera editada y los minutos', () => {
    const form = reviewForm();
    form.set('date', '2026-09-20'); form.set('kind', 'CLASE'); form.set('paper', ''); form.set('part', '');
    form.set('source', 'TRAINER'); form.set('sourceRef', 'Editada'); form.set('itemsTotal', '10');
    form.set('itemsCorrect', ''); form.set('timed', 'on'); form.set('durationMin', '17');
    const payload = buildImportPayload(form, [0], { targetId: null, importedHeader: header });
    expect(payload.has('sessionId')).toBe(false);
    expect(payload.has('rows')).toBe(false);
    expect(payload.get('durationMin')).toBe('17');
    expect(json(payload, 'envelope')).toMatchObject({
      session: { date: '2026-09-20', kind: 'CLASE', paper: null, part: null, source: 'TRAINER', sourceRef: 'Editada', itemsTotal: 10, itemsCorrect: null, timed: true },
      errors: [{ itemRef: '4', prompt: 'Enunciado 0' }],
    });
  });

  it('con destino conserva la cabecera del bloque y no manda minutos', () => {
    const payload = buildImportPayload(reviewForm(), [0, 2], { targetId: 3, importedHeader: header });
    expect(payload.get('sessionId')).toBe('3');
    expect(payload.has('durationMin')).toBe(false);
    const envelope = json(payload, 'envelope') as { session: unknown; errors: { itemRef: string }[] };
    expect(envelope.session).toEqual(header);
    expect(envelope.errors.map((error) => error.itemRef)).toEqual(['4', '6']);
  });
});
