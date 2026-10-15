import { describe, expect, it } from 'vitest';

import { en } from './en';
import { es } from './es';
import { DEFAULT_LOCALE, LOCALES, getMessages, isLocale, withFallback } from './index';

/** Ruta de cada hoja del diccionario y su forma: texto, lista o función. */
function leaves(value: unknown, prefix = ''): Map<string, string> {
  const found = new Map<string, string>();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    found.set(prefix, Array.isArray(value) ? `array:${String(value.length)}` : typeof value);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    for (const [path, kind] of leaves(child, prefix === '' ? key : `${prefix}.${key}`)) found.set(path, kind);
  }
  return found;
}

describe('diccionarios de la interfaz', () => {
  const english = leaves(en);
  const spanish = leaves(es);

  it('el español traduce todas las claves del inglés', () => {
    const missing = [...english.keys()].filter((path) => !spanish.has(path));
    expect(missing).toEqual([]);
  });

  it('el español no trae claves que el inglés no conoce', () => {
    const extra = [...spanish.keys()].filter((path) => !english.has(path));
    expect(extra).toEqual([]);
  });

  it('cada clave tiene la misma forma en los dos idiomas', () => {
    const different = [...english].filter(([path, kind]) => spanish.has(path) && spanish.get(path) !== kind);
    expect(different).toEqual([]);
  });

  it('cada diccionario dice su idioma', () => {
    for (const locale of LOCALES) expect(getMessages(locale).locale).toBe(locale);
  });

  it('una clave sin traducir se lee en inglés', () => {
    const merged = withFallback(en, { common: { cancel: 'Cancelar' } });
    expect(merged.common.cancel).toBe('Cancelar');
    expect(merged.common.close).toBe(en.common.close);
    expect(merged.nav.sessions).toBe(en.nav.sessions);
    expect(merged.format.errors(2)).toBe('2 errors');
  });
});

describe('idioma por defecto', () => {
  it('es el inglés, sea cual sea el navegador', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('solo acepta los idiomas de la interfaz', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('ES')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
