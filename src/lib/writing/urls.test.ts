import { describe, expect, it } from 'vitest';

import { parseWritingKey, writingHref } from './urls';

describe('URLs del lector de Writing', () => {
  it('lleva el número y el título; el número basta para encontrarla', () => {
    const href = writingHref({ id: 12, title: 'Making cities more liveable' });
    expect(href).toBe('/writing/12-making-cities-more-liveable');
    expect(parseWritingKey(href.split('/').at(-1) ?? '')).toBe(12);
    expect(writingHref({ id: 12, title: '¿Qué café?' })).toBe('/writing/12-qué-café');
  });

  it('un texto antiguo sin título se queda en el número', () => {
    expect(writingHref({ id: 7, title: null })).toBe('/writing/7');
    expect(writingHref({ id: 7, title: '!!!' })).toBe('/writing/7');
  });

  it.each(['12', '12-making-cities', '12-título-anterior'])('resuelve %s', (key) => {
    expect(parseWritingKey(key)).toBe(12);
  });

  it.each(['', '0', '-12', '12foo', 'importar', '9007199254740992-writing'])('rechaza %s', (key) => {
    expect(parseWritingKey(key)).toBeNull();
  });
});
