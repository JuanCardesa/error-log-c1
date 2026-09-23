import { describe, expect, it } from 'vitest';

import { errorsForRow, IMPORT_PROMPT, IMPORT_TEMPLATE, MAX_IMPORT_LENGTH, MAX_SESSION_IMPORT_ROWS, parseImportedBatch } from './errors';

const draftsOf = (source: string) => parseImportedBatch(source).errors;

const example = {
  itemRef: 4, prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'phrasal verb', ruleNote: 'Call off significa cancelar una actividad.',
};

const session = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO',
  sourceRef: 'Ready for C1 Advanced · págs. 6-7 · actividades 1-5', itemsTotal: 8, itemsCorrect: 6, timed: false };

it('reconoce el sobre sin convertirlo en una fila vacía', () => {
  expect(draftsOf(JSON.stringify({ session, errors: [example] }))[0]?.prompt).toBe(example.prompt);
});

it.each([
  [{ session: { ...session, id: 123 }, errors: [example] }, 'id'],
  [{ session: { ...session, status: 'CLOSED' }, errors: [example] }, 'status'],
  [{ session: { ...session, durationMin: 10 }, errors: [example] }, 'durationMin'],
  [{ session: { ...session, timed: 'false' }, errors: [example] }, 'timed'],
  [{ session: { ...session, itemsTotal: null }, errors: [example] }, 'itemsTotal'],
  [{ session: { ...session, part: 1 }, errors: [example] }, 'part'],
  [{ session: { ...session, date: '2999-01-01' }, errors: [example] }, 'futura'],
  [{ session }, 'errors'],
  [{ session, errors: 'incorrecto' }, 'errors'],
])('rechaza un sobre incompleto o manipulado con el campo concreto', (value, message) => {
  expect(() => draftsOf(JSON.stringify(value))).toThrow(message);
});

describe('pegar errores', () => {
  it('acepta errors sin session igual que el array para que la UI indique dónde pegarlo', () => {
    const parsed = parseImportedBatch(JSON.stringify({ errors: [example] }));
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
    expect(draftsOf(IMPORT_TEMPLATE)[0]?.correctAnswer).toBe('off');
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
});

describe('el ejemplo de las instrucciones', () => {
  // Si el prompt y el importador divergen, la IA obedece y la importacion se rechaza.
  const example = IMPORT_PROMPT.slice(IMPORT_PROMPT.indexOf('{'), IMPORT_PROMPT.lastIndexOf('}') + 1);

  it('lo acepta el importador tal cual', () => {
    const parsed = parseImportedBatch(example, '2026-09-23');
    expect(parsed.session).toMatchObject({ date: '2026-09-15', kind: 'DRILL', source: 'LIBRO', itemsTotal: 8, timed: false });
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatchObject({
      itemRef: '4', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB',
      cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
    });
  });

  it('declara part como numero o null, que es lo que exige el esquema', () => {
    expect(IMPORT_PROMPT).toContain('part: entero positivo, o null.');
    expect(() => parseImportedBatch(example.replace('"part": null', '"part": "3"'), '2026-09-23'))
      .toThrow('Sobre inválido');
  });

  it('anuncia el limite de filas del sobre, no el del array suelto', () => {
    expect(IMPORT_PROMPT).toContain(`${String(MAX_SESSION_IMPORT_ROWS)} errores por sesion`);
  });
});
