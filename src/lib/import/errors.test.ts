import { describe, expect, it } from 'vitest';

import { IMPORT_TEMPLATE, MAX_IMPORT_LENGTH, parseImportedErrors } from './errors';

const example = {
  itemRef: 4, prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'phrasal verb', ruleNote: 'Call off significa cancelar una actividad.',
};

describe('pegar errores', () => {
  it('acepta el bloque de la IA, normaliza categorias y deja visibles los valores por defecto', () => {
    expect(parseImportedErrors('```json\n' + JSON.stringify([example]) + '\n```')[0]).toMatchObject({
      ...example, itemRef: '4', category: 'PHRASAL_VERB', cause: 'DESCONOCIMIENTO', confidence: 'DUDABA',
      ankiAdded: false, lateInSession: false,
    });
  });

  it('conserva campos pendientes para completarlos en la vista previa', () => {
    expect(parseImportedErrors(JSON.stringify({ prompt: 'Pendiente de corregir' }))[0]).toMatchObject({
      prompt: 'Pendiente de corregir', correctAnswer: '', category: '', ruleNote: '',
    });
  });

  it('admite la plantilla y cabeceras en distinto orden con acentos', () => {
    expect(parseImportedErrors(IMPORT_TEMPLATE)[0]?.correctAnswer).toBe('off');
    expect(parseImportedErrors('Correcta\tEnunciado\tCategoría\tCausa\tConfianza\noff\tcalled ___\tPHRASAL_VERB\tconfusión\tseguro')[0]).toMatchObject({
      correctAnswer: 'off', category: 'PHRASAL_VERB', cause: 'CONFUSION', confidence: 'SEGURO',
    });
  });

  it('lee seis columnas sin cabeceras con item vacio, comillas y saltos de linea', () => {
    const rows = parseImportedErrors('\t"He said ""hello""\nand left"\tbye\thello\tLEXICO\tSaludar al llegar y despedirse al salir.\n');
    expect(rows[0]).toMatchObject({ itemRef: '', prompt: 'He said "hello"\nand left', correctAnswer: 'hello' });
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
    expect(() => parseImportedErrors(source)).toThrow(expected);
  });
});
