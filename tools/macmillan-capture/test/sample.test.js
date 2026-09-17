import { describe, expect, it } from 'vitest';

import { redact } from '../src/dom/sample.js';

describe('enmascarado de la muestra tecnica', () => {
  it('oculta el valor de cualquier atributo cuyo nombre suene a credencial', () => {
    for (const name of ['data-token', 'authorization', 'data-session-id', 'apiKey', 'data-jwt', 'x-auth']) {
      expect(redact(name, 'lo-que-sea'), name).toBe('[OCULTO]');
    }
  });

  it('oculta un JWT aunque el atributo se llame de forma inocente', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
    expect(redact('data-config', `user=${jwt}`)).not.toContain('eyJhbGci');
    expect(redact('data-config', `user=${jwt}`)).toContain('[OCULTO]');
  });

  it('oculta cadenas largas con pinta de clave', () => {
    const clave = 'a'.repeat(48);
    expect(redact('data-x', clave)).toBe('[OCULTO]');
  });

  it('oculta los parametros sensibles de una URL pero deja ver cual era', () => {
    const url = 'https://ejemplo.test/recurso?contentId=42&access_token=secreto-de-verdad';
    const safe = redact('data-src', url);
    expect(safe).not.toContain('secreto-de-verdad');
    expect(safe).toContain('contentId=42');
  });

  it('no estropea lo que el adaptador necesita', () => {
    // El identificador de contenido de Macmillan son 32 hexadecimales: tiene que pasar.
    expect(redact('data-rcfxmlid', '83218bdf97374e06a8d5d37cb2e3048e')).toBe('83218bdf97374e06a8d5d37cb2e3048e');
    expect(redact('class', 'markable dev-markable-container incorrectAnswer')).toBe('markable dev-markable-container incorrectAnswer');
    expect(redact('aria-invalid', 'true')).toBe('true');
    expect(redact('data-rcfid', 'CAPE_ID_15')).toBe('CAPE_ID_15');
  });
});
