import { describe, expect, it } from 'vitest';

import { escapeCsvValue, toCsv } from './csv';

describe('escapado de valores', () => {
  it('deja intacto lo que no necesita comillas', () => {
    expect(escapeCsvValue('COLOCACION')).toBe('COLOCACION');
    expect(escapeCsvValue(42)).toBe('42');
    expect(escapeCsvValue(0)).toBe('0');
  });

  it('representa los booleanos sin ambiguedad', () => {
    expect(escapeCsvValue(true)).toBe('true');
    expect(escapeCsvValue(false)).toBe('false');
  });

  it('convierte nulo y ausente en campo vacio', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('entrecomilla cuando hay coma, salto de linea o retorno', () => {
    expect(escapeCsvValue('uno, dos')).toBe('"uno, dos"');
    expect(escapeCsvValue('linea\nsiguiente')).toBe('"linea\nsiguiente"');
    expect(escapeCsvValue('linea\rsiguiente')).toBe('"linea\rsiguiente"');
  });

  it('duplica las comillas internas y entrecomilla el campo', () => {
    expect(escapeCsvValue('dijo "hola"')).toBe('"dijo ""hola"""');
    // El caso que rompe los serializadores caseros: solo comillas.
    expect(escapeCsvValue('"')).toBe('""""');
  });

  it('escapa una nota real con comillas angulares y coma', () => {
    const note = 'En las cleft con "it was... that", la preposicion no desaparece';
    expect(escapeCsvValue(note)).toBe(
      '"En las cleft con ""it was... that"", la preposicion no desaparece"',
    );
  });
});

describe('composicion del fichero', () => {
  it('escribe cabecera y filas separadas por CRLF, con CRLF final', () => {
    const csv = toCsv(['causa', 'n'], [['DESPISTE', 6], ['CONFUSION', 3]]);
    expect(csv).toBe('causa,n\r\nDESPISTE,6\r\nCONFUSION,3\r\n');
  });

  it('produce solo la cabecera cuando no hay filas', () => {
    expect(toCsv(['causa', 'n'], [])).toBe('causa,n\r\n');
  });

  it('escapa tambien las cabeceras', () => {
    expect(toCsv(['errores/100 items'], [])).toBe('errores/100 items\r\n');
    expect(toCsv(['a,b'], [])).toBe('"a,b"\r\n');
  });

  it('mantiene el numero de columnas aunque haya nulos', () => {
    const csv = toCsv(['a', 'b', 'c'], [[1, null, 3]]);
    expect(csv).toBe('a,b,c\r\n1,,3\r\n');
  });
});
