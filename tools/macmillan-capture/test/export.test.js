import { describe, expect, it } from 'vitest';

import { parseImportedBatch } from '../../../src/lib/import/errors.ts';

/** El importador devuelve cabecera y filas; aqui solo se pegan filas sueltas. */
const parseImportedErrors = (text) => parseImportedBatch(text).errors;
import { itemRefFor, renderPrompt, summarize } from '../src/core/items.js';
import { rowFingerprint, toImportEntries, toJson } from '../src/core/exportable.js';

/** Las filas tal como se pegan, sin el identificador de hueco que se queda dentro. */
const toImportRows = (capture) => toImportEntries(capture).map((entry) => entry.row);

/** «They called ___ the meeting.» con un solo hueco. */
const singleGap = {
  itemRef: '4',
  instructions: '',
  context: '',
  segments: [
    { type: 'text', text: 'They called ' },
    { type: 'gap', controlId: 'c1' },
    { type: 'text', text: ' the meeting.' },
  ],
};

/** Una pregunta con dos huecos, para distinguir cual he fallado. */
const twoGaps = {
  itemRef: '7',
  instructions: '',
  context: '',
  segments: [
    { type: 'text', text: 'She ' },
    { type: 'gap', controlId: 'c2' },
    { type: 'text', text: ' up early and ' },
    { type: 'gap', controlId: 'c3' },
    { type: 'text', text: ' out.' },
  ],
};

function capture(overrides = {}) {
  return {
    questions: [singleGap],
    verdicts: new Map([['c1', 'incorrect']]),
    answers: new Map([['c1', 'of']]),
    solutions: new Map(),
    explanations: new Map(),
    ...overrides,
  };
}

describe('enunciado y referencia del hueco', () => {
  it('con un hueco deja el enunciado tal cual', () => {
    expect(renderPrompt(singleGap)).toBe('They called ___ the meeting.');
    expect(itemRefFor(singleGap, 'c1')).toBe('4');
  });

  it('con varios huecos los numera y conserva el contexto entero', () => {
    expect(renderPrompt(twoGaps)).toBe('She ___(1) up early and ___(2) out.');
    expect(itemRefFor(twoGaps, 'c2')).toBe('7.1');
    expect(itemRefFor(twoGaps, 'c3')).toBe('7.2');
  });
});

describe('solo mis fallos', () => {
  it('un ejercicio entero correcto no genera ninguna entrada', () => {
    const rows = toImportRows(capture({ verdicts: new Map([['c1', 'correct']]) }));
    expect(rows).toEqual([]);
  });

  it('de una mezcla salen solo los fallos', () => {
    const rows = toImportRows(capture({
      questions: [twoGaps],
      verdicts: new Map([['c2', 'correct'], ['c3', 'incorrect']]),
      answers: new Map([['c2', 'got'], ['c3', 'went']]),
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('7.2');
    expect(rows[0].myAnswer).toBe('went');
    expect(rows[0].prompt).toBe('She ___(1) up early and ___(2) out.');
  });

  it('un hueco sin veredicto no es un fallo', () => {
    expect(toImportRows(capture({ verdicts: new Map() }))).toEqual([]);
  });
});

describe('campos que no se inventan', () => {
  it('deja categoria y regla vacias cuando la plataforma no las da', () => {
    const [row] = toImportRows(capture());
    expect(row.category).toBe('');
    expect(row.ruleNote).toBe('');
    expect(row.subcategory).toBe('');
  });

  it('no manda causa ni confianza: las propone el importador y las reviso yo', () => {
    const [row] = toImportRows(capture());
    expect(row).not.toHaveProperty('cause');
    expect(row).not.toHaveProperty('confidence');
    expect(row).not.toHaveProperty('ankiAdded');
  });

  it('si no hay solucion visible, correctAnswer queda pendiente', () => {
    const [row] = toImportRows(capture());
    expect(row.correctAnswer).toBe('');
  });

  it('copia la solucion y la explicacion solo cuando existen', () => {
    const [row] = toImportRows(capture({
      solutions: new Map([['c1', 'off']]),
      explanations: new Map([['c1', 'Call off means to cancel something.']]),
    }));
    expect(row.correctAnswer).toBe('off');
    expect(row.ruleNote).toBe('Call off means to cancel something.');
  });

  it('descarta una explicacion que solo repite la solucion', () => {
    const [row] = toImportRows(capture({
      solutions: new Map([['c1', 'off']]),
      explanations: new Map([['c1', 'off']]),
    }));
    expect(row.ruleNote).toBe('');
  });
});

describe('huella para el control de duplicados', () => {
  const activity = 'act-1';

  it('el mismo fallo da siempre la misma huella', () => {
    const [row] = toImportRows(capture());
    expect(rowFingerprint(row, activity)).toBe(rowFingerprint(row, activity));
  });

  it('no depende del intento: repetir el ejercicio y fallar igual no duplica', () => {
    const [row] = toImportRows(capture());
    const other = { ...row };
    expect(rowFingerprint(other, activity)).toBe(rowFingerprint(row, activity));
  });

  it('cambia si cambia mi respuesta o la actividad', () => {
    const [row] = toImportRows(capture());
    expect(rowFingerprint({ ...row, myAnswer: 'away' }, activity)).not.toBe(rowFingerprint(row, activity));
    expect(rowFingerprint(row, 'act-2')).not.toBe(rowFingerprint(row, activity));
  });

});

describe('recuento para la cabecera de la sesion', () => {
  it('cuenta aciertos aparte, nunca como entradas del listado', () => {
    const controls = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const verdicts = new Map([['c1', 'correct'], ['c2', 'incorrect']]);
    expect(summarize(controls, verdicts)).toEqual({ checked: 2, correct: 1, incorrect: 1, pending: 1 });
  });
});

describe('contrato real del importador', () => {
  it('el bloque generado pasa por parseImportedErrors tal cual', () => {
    const rows = toImportRows(capture({ solutions: new Map([['c1', 'off']]) }));
    const parsed = parseImportedErrors(toJson(rows));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      itemRef: '4',
      prompt: 'They called ___ the meeting.',
      myAnswer: 'of',
      correctAnswer: 'off',
      category: '',
      ruleNote: '',
      cause: 'DESCONOCIMIENTO',
      confidence: 'DUDABA',
      lateInSession: false,
    });
  });

  it('una tanda con varios fallos y campos pendientes tambien pasa', () => {
    const rows = toImportRows(capture({
      questions: [singleGap, twoGaps],
      verdicts: new Map([['c1', 'incorrect'], ['c2', 'incorrect'], ['c3', 'incorrect']]),
      answers: new Map([['c1', 'of'], ['c2', 'get'], ['c3', 'set']]),
    }));
    expect(rows).toHaveLength(3);
    expect(() => parseImportedErrors(toJson(rows))).not.toThrow();
  });

  it('un ejercicio sin fallos no produce bloque que pegar', () => {
    const rows = toImportRows(capture({ verdicts: new Map([['c1', 'correct']]) }));
    expect(rows).toEqual([]);
    expect(() => parseImportedErrors(toJson(rows))).toThrow();
  });
});
