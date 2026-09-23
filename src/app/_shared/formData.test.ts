import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { checkbox, collectIssues, integer, isValidId, text } from './formData';

const form = (entries: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

describe('lectura de FormData', () => {
  it('devuelve cadena vacia cuando el campo no viene', () => {
    expect(text(form({}), 'date')).toBe('');
  });

  it('trata el numerico vacio como ausente, no como cero', () => {
    expect(integer(form({ part: '' }), 'part')).toBeNull();
    expect(integer(form({ part: '   ' }), 'part')).toBeNull();
    expect(integer(form({}), 'part')).toBeNull();
  });

  it('marca un numero invalido como NaN para que Zod lo rechace', () => {
    // Si devolviera null, un dato mal tecleado pasaria por campo omitido.
    expect(integer(form({ itemsTotal: 'ocho' }), 'itemsTotal')).toBeNaN();
    expect(integer(form({ itemsTotal: 'Infinity' }), 'itemsTotal')).toBeNaN();
    expect(integer(form({ itemsTotal: ' 8 ' }), 'itemsTotal')).toBe(8);
  });

  it('el checkbox solo cuenta cuando el navegador lo envia', () => {
    expect(checkbox(form({ timed: 'on' }), 'timed')).toBe(true);
    expect(checkbox(form({}), 'timed')).toBe(false);
  });

  it('solo acepta identificadores enteros positivos', () => {
    expect(isValidId(4)).toBe(true);
    expect(isValidId(0)).toBe(false);
    expect(isValidId(-1)).toBe(false);
    expect(isValidId(1.5)).toBe(false);
    expect(isValidId(Number.NaN)).toBe(false);
    expect(isValidId(null)).toBe(false);
  });
});

describe('agrupacion de errores de Zod', () => {
  const schema = z.object({
    date: z.string().min(1, 'Falta la fecha.').max(3, 'Demasiado larga.'),
    part: z.number(),
  });

  it('agrupa por campo y acumula varios mensajes del mismo', () => {
    const parsed = schema.safeParse({ date: '', part: 'x' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const fieldErrors = collectIssues(parsed.error);
    expect(fieldErrors['date']).toEqual(['Falta la fecha.']);
    expect(fieldErrors['part']).toHaveLength(1);
  });

  it('manda los errores sin campo al cajon _', () => {
    const refined = z.object({ a: z.number() }).refine(() => false, 'Incoherente.');
    const parsed = refined.safeParse({ a: 1 });
    if (parsed.success) throw new Error('el refine deberia fallar');
    expect(collectIssues(parsed.error)['_']).toEqual(['Incoherente.']);
  });
});
