import { describe, expect, it } from 'vitest';

import type { ImportDraft } from '@/lib/import/errors';
import { buildImportPayload, missingFields, nextPendingIndex, snapshotFromDraft, type RowSnapshot } from './reviewRows';

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

  it('el siguiente pendiente sigue el orden de la tanda y da la vuelta', () => {
    const draft = (ruleNote: string): ImportDraft => ({
      ...complete, ruleNote, cause: 'CONFUSION', confidence: 'SEGURO', subcategory: '', lateInSession: false,
    });
    const rows = [draft(''), draft(complete.ruleNote), draft(''), draft(complete.ruleNote)];
    expect(nextPendingIndex(rows, 0)).toBe(2);
    expect(nextPendingIndex(rows, 2)).toBe(0);
    expect(nextPendingIndex([draft(complete.ruleNote)], 0)).toBeNull();
  });
});

describe('contrato del envio de una tanda', () => {
  const header = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: 'Sobre', itemsTotal: 8, itemsCorrect: 6, timed: false } as const;

  /** Borrador de la tanda con las filas 0, 1 y 2; la 1 lleva «al final de la sesion». */
  const drafts = (): ImportDraft[] => [0, 1, 2].map((id) => ({
    itemRef: String(id + 4),
    prompt: `Enunciado ${String(id)}`,
    myAnswer: 'of',
    correctAnswer: 'off',
    cause: 'CONFUSION',
    category: 'PHRASAL_VERB',
    subcategory: '',
    confidence: 'SEGURO',
    ruleNote: `Regla suficientemente larga ${String(id)}`,
    lateInSession: id === 1,
  }));

  const json = (payload: FormData, key: string): unknown => JSON.parse(String(payload.get(key)));

  it('sin cabecera envia rows con los nombres de cada campo y solo las filas que quedan', () => {
    // La fila 0 se quito de la tanda: ya no esta en el borrador que se envia.
    const payload = buildImportPayload(drafts().slice(1), { targetId: 7, header: undefined });
    expect(payload.get('sessionId')).toBe('7');
    expect(payload.has('envelope')).toBe(false);
    expect(json(payload, 'rows')).toEqual([
      { itemRef: '5', prompt: 'Enunciado 1', myAnswer: 'of', correctAnswer: 'off', cause: 'CONFUSION', category: 'PHRASAL_VERB', subcategory: '', confidence: 'SEGURO', ruleNote: 'Regla suficientemente larga 1', lateInSession: true },
      { itemRef: '6', prompt: 'Enunciado 2', myAnswer: 'of', correctAnswer: 'off', cause: 'CONFUSION', category: 'PHRASAL_VERB', subcategory: '', confidence: 'SEGURO', ruleNote: 'Regla suficientemente larga 2', lateInSession: false },
    ]);
  });

  it('sin destino crea la sesion con la cabecera editada y los minutos', () => {
    const edited = { date: '2026-09-20', kind: 'CLASE', paper: null, part: null, source: 'TRAINER', sourceRef: 'Editada', itemsTotal: 10, itemsCorrect: null, timed: true } as const;
    const payload = buildImportPayload(drafts().slice(0, 1), { targetId: null, header: edited, durationMin: 17 });
    expect(payload.has('sessionId')).toBe(false);
    expect(payload.has('rows')).toBe(false);
    expect(payload.get('durationMin')).toBe('17');
    expect(json(payload, 'envelope')).toMatchObject({
      session: { date: '2026-09-20', kind: 'CLASE', paper: null, part: null, source: 'TRAINER', sourceRef: 'Editada', itemsTotal: 10, itemsCorrect: null, timed: true },
      errors: [{ itemRef: '4', prompt: 'Enunciado 0' }],
    });
  });

  it('con destino conserva la cabecera del bloque y no manda minutos', () => {
    const rows = drafts();
    const payload = buildImportPayload([rows[0], rows[2]].filter((row) => row !== undefined), { targetId: 3, header });
    expect(payload.get('sessionId')).toBe('3');
    expect(payload.has('durationMin')).toBe(false);
    const envelope = json(payload, 'envelope') as { session: unknown; errors: { itemRef: string }[] };
    expect(envelope.session).toEqual(header);
    expect(envelope.errors.map((error) => error.itemRef)).toEqual(['4', '6']);
  });
});

describe('minutos al crear la sesion', () => {
  it('sin minutos manda el campo vacio, que el servidor lee como ausente', () => {
    const header = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: null, itemsTotal: 0, itemsCorrect: 0, timed: false } as const;
    const payload = buildImportPayload([], { targetId: null, header, durationMin: null });
    expect(payload.get('durationMin')).toBe('');
    expect(JSON.parse(String(payload.get('envelope')))).toEqual({ session: header, errors: [] });
  });
});
