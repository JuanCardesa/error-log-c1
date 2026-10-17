import { describe, expect, it } from 'vitest';

import { getMessages } from '../i18n';
import {
  errorsForRow, ImportProblem, importPrompt, importTemplate, jsonLine, MAX_IMPORT_LENGTH, MAX_SESSION_IMPORT_ROWS, parseImportedBatch,
} from './errors';

const t = getMessages('es');
const en = getMessages('en');
const draftsOf = (source: string) => parseImportedBatch(source, t).errors;

/** Lo que dice el aviso de una tanda rechazada: el resumen y una línea por dato. */
function problemOf(source: string, locale = t): ImportProblem {
  try {
    parseImportedBatch(source, locale);
  } catch (error) {
    if (error instanceof ImportProblem) return error;
    throw error;
  }
  throw new Error('la tanda se aceptó');
}
const linesOf = (problem: ImportProblem) => problem.issues.map((issue) => `${String(issue.line)} ${issue.field}: ${issue.message}`);

const example = {
  itemRef: 4, prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'phrasal verb', ruleNote: 'Call off significa cancelar una actividad.',
};

const session = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO',
  sourceRef: 'Libro de prueba · págs. 6-7 · actividades 1-5', itemsTotal: 8, itemsCorrect: 6, timed: false };

it('reconoce el sobre sin convertirlo en una fila vacía', () => {
  expect(draftsOf(JSON.stringify({ session, errors: [example] }))[0]?.prompt).toBe(example.prompt);
});

it.each([
  [{ session: { ...session, id: 123 }, errors: [example] }, 'id'],
  [{ session: { ...session, status: 'CLOSED' }, errors: [example] }, 'status'],
  [{ session: { ...session, durationMin: 10 }, errors: [example] }, 'durationMin'],
  [{ session: { ...session, timed: 'false' }, errors: [example] }, 'Cronometrada: Llega "false"; tiene que ser true o false.'],
  [{ session: { ...session, itemsCorrect: 9 }, errors: [example] }, 'Aciertos:'],
  [{ session: { ...session, part: 1 }, errors: [example] }, 'Part:'],
  [{ session: { ...session, date: '2999-01-01' }, errors: [example] }, 'futura'],
  [{ session }, 'Errores: Falta este campo.'],
  [{ session, errors: 'incorrecto' }, 'Errores: Llega "incorrecto"; tiene que ser una lista de errores entre corchetes.'],
])('rechaza un sobre incompleto o manipulado con el campo concreto', (value, message) => {
  expect(linesOf(problemOf(JSON.stringify(value))).join('\n')).toContain(message);
});

it('dice en qué línea está cada dato que no vale y qué valores admite, con su nombre legible', () => {
  const fence = '```';
  const body = JSON.stringify({ session: { ...session, kind: 'DRIL', source: 'BOOK', paper: 'RUOE' }, errors: [example] }, null, 2);
  const pasted = `\n${fence}json\n${body}\n${fence}`;
  const problem = problemOf(pasted);
  expect(problem.message).toBe('Hay 2 datos que no valen en la tanda. Corrígelos en el texto y vuelve a revisarla.');
  // Línea 1 en blanco, 2 la valla, 3 la llave, 4 «session», 5 «date», 6 «kind»… 8 «part», 9 «source».
  expect(linesOf(problem)).toEqual([
    '6 Tipo: "DRIL" no es un valor admitido: usa DRILL, PARCIAL, SIMULACRO, CLASE o WRITING.',
    '9 Fuente: "BOOK" no es un valor admitido: usa LIBRO, WORKBOOK, TRAINER, PAST_PAPER (Examen pasado), ONLINE o ACADEMIA.',
  ]);
  expect(linesOf(problemOf(JSON.stringify({ session: { ...session, paper: 'R' }, errors: [] }), en))).toEqual([
    '1 Exam format: "R" isn’t an accepted value: use RUOE (Reading & Use of English), WRITING, LISTENING or SPEAKING.',
  ]);
});

it('señala un campo que sobra en su propia línea', () => {
  const text = JSON.stringify({ session: { ...session, status: 'CLOSED' }, errors: [example] }, null, 2);
  const line = text.split('\n').findIndex((value) => value.includes('"status"')) + 1;
  expect(linesOf(problemOf(text))).toEqual([`${String(line)} Sesión: campos no permitidos (status)`]);
});

it('jsonLine sigue claves y posiciones, y para en el padre si el campo falta', () => {
  const text = '{\n  "a": [\n    {"b": 1},\n    {\n      "b": "x\\"y",\n      "c": null\n    }\n  ]\n}';
  expect(jsonLine(text, ['a', 1, 'c'])).toBe(6);
  expect(jsonLine(text, ['a', 0, 'b'])).toBe(3);
  expect(jsonLine(text, ['a', 1, 'missing'])).toBe(4);
  expect(jsonLine(text, [])).toBe(1);
});

it('acepta un sobre sin ítems ni aciertos: quien solo ve los fallos no los sabe', () => {
  const parsed = parseImportedBatch(JSON.stringify({ session: { ...session, itemsTotal: null, itemsCorrect: null }, errors: [example] }), t);
  expect(parsed.session).toMatchObject({ itemsTotal: null, itemsCorrect: null });
  expect(parsed.errors).toHaveLength(1);
});

describe('pegar errores', () => {
  it('acepta errors sin session igual que el array para que la UI indique dónde pegarlo', () => {
    const parsed = parseImportedBatch(JSON.stringify({ errors: [example] }), t);
    expect(parsed.session).toBe(null);
    expect(parsed.errors).toEqual(draftsOf(JSON.stringify([example])));
  });

  it('mapea ambos prefijos sin confundir posiciones ni cabecera', () => {
    const fields = { '1.prompt': ['Obligatorio'], 'errors.1.prompt': ['Debe ser texto'],
      'errors.10.prompt': ['Otra fila'], 'session.sourceRef': ['Cabecera'] };
    expect(errorsForRow(fields, 1)).toEqual({ prompt: ['Obligatorio', 'Debe ser texto'] });
    expect(errorsForRow(fields, -1)).toEqual({});
  });

  it('acepta el bloque de la IA, normaliza categorias y deja visibles los valores por defecto', () => {
    expect(draftsOf('```json\n' + JSON.stringify([example]) + '\n```')[0]).toMatchObject({
      ...example, itemRef: '4', category: 'PHRASAL_VERB', cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
      lateInSession: false,
    });
  });

  it('descarta una conversion que venga en el bloque: eso lo sella Anki', () => {
    const draft = draftsOf(JSON.stringify([{ ...example, ankiAdded: true }]))[0];
    expect(draft).not.toHaveProperty('ankiAdded');
  });

  it('conserva campos pendientes para completarlos en la vista previa', () => {
    expect(draftsOf(JSON.stringify({ prompt: 'Pendiente de corregir' }))[0]).toMatchObject({
      prompt: 'Pendiente de corregir', correctAnswer: '', category: '', ruleNote: '',
    });
  });

  it('admite la plantilla y cabeceras en distinto orden con acentos', () => {
    expect(draftsOf(importTemplate(t))[0]?.correctAnswer).toBe('off');
    // La plantilla inglesa usa sus propias cabeceras y el importador las acepta igual.
    expect(draftsOf(importTemplate(en))[0]).toMatchObject({
      itemRef: '4', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB',
    });
    expect(draftsOf('Correcta\tEnunciado\tCategoría\tCausa\tConfianza\noff\tcalled ___\tPHRASAL_VERB\tconfusión\tseguro')[0]).toMatchObject({
      correctAnswer: 'off', category: 'PHRASAL_VERB', cause: 'CONFUSION', confidence: 'SEGURO',
    });
  });

  it('lee seis columnas sin cabeceras con item vacio, comillas y saltos de linea', () => {
    const rows = draftsOf('\t"He said ""hello""\nand left"\tbye\thello\tLEXICO\tSaludar al llegar y despedirse al salir.\n');
    expect(rows[0]).toMatchObject({ itemRef: '', prompt: 'He said "hello"\nand left', correctAnswer: 'hello' });
  });

  it('propone los valores por defecto cuando causa y confianza vienen en blanco', () => {
    expect(draftsOf('Correcta\tEnunciado\tCategoria\tCausa\tConfianza\noff\tcalled ___\tPHRASAL_VERB\t\t')[0]).toMatchObject({
      cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
    });
    expect(draftsOf(JSON.stringify([{ ...example, cause: '', confidence: '' }]))[0]).toMatchObject({
      cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
    });
  });

  it.each([
    ['', 'Pega primero'],
    ['Esto es una correccion en texto libre.', 'instrucciones para la IA'],
    ['[{"prompt":', 'incompleto'],
    ['[]', 'entre 1 y 100'],
    ['Enunciado\tCorrecta\tDesconocida\na\tb\tc', 'columnas desconocidas'],
    ['a\tb\tc', '6 columnas'],
    ['4\t"sin cerrar\ta\tb\tLEXICO\tregla', 'comillas sin cerrar'],
    [JSON.stringify([{ ...example, cause: 'INVENTADA' }]), 'causa o confianza'],
    [JSON.stringify(Array.from({ length: 101 }, () => example)), 'entre 1 y 100'],
    ['x'.repeat(MAX_IMPORT_LENGTH + 1), 'demasiado largo'],
  ])('explica un pegado invalido sin descartar silenciosamente filas', (source, expected) => {
    expect(() => draftsOf(source)).toThrow(expected);
  });

  it('explica el problema en el idioma de la interfaz', () => {
    expect(() => parseImportedBatch('', en)).toThrow('Paste your errors first.');
    expect(() => parseImportedBatch('a\tb\tc', en)).toThrow('6 columns');
    const future = problemOf(JSON.stringify({ session: { ...session, date: '2999-01-01' }, errors: [example] }), en);
    expect(future.message).toBe('One value in the batch isn’t valid. Fix it in the text and review again.');
    expect(linesOf(future)).toEqual(['1 Date: The date can’t be in the future']);
  });
});

describe('el ejemplo de las instrucciones', () => {
  // Si el prompt y el importador divergen, la IA obedece y la importacion se rechaza.
  const prompt = importPrompt(t);
  const example = prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('}') + 1);

  it('lo acepta el importador tal cual', () => {
    const parsed = parseImportedBatch(example, t, '2026-09-23');
    expect(parsed.session).toMatchObject({ date: '2026-09-15', kind: 'DRILL', source: 'LIBRO', itemsTotal: 8, timed: false });
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatchObject({
      itemRef: '4', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB',
      cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
    });
  });

  it('declara part como numero o null, que es lo que exige el esquema', () => {
    expect(prompt).toContain('part: entero positivo, o null.');
    expect(importPrompt(en)).toContain('part: positive integer, or null.');
    expect(() => parseImportedBatch(example.replace('"part": null', '"part": "3"'), t, '2026-09-23'))
      .toThrow('Hay un dato que no vale en la tanda');
  });

  it('anuncia el limite de filas del sobre, no el del array suelto', () => {
    expect(prompt).toContain(`${String(MAX_SESSION_IMPORT_ROWS)} errores por sesion`);
    expect(importPrompt(en)).toContain(`${String(MAX_SESSION_IMPORT_ROWS)} errors per session`);
  });

  it('lleva el mismo ejemplo en los dos idiomas: el contrato no se traduce', () => {
    const english = importPrompt(en);
    expect(english.slice(english.indexOf('{'), english.lastIndexOf('}') + 1)).toBe(example);
  });
});
