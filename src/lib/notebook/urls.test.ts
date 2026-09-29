import { describe, expect, it } from 'vitest';

import { classifyNotebookUrl } from './urls';

describe('URLs de Notebook', () => {
  it.each([
    ['#nb-must-have', '/notebook/#nb-must-have'],
    ['/notebook/42-past-modal-verbs', '/notebook/42-past-modal-verbs'],
    ['../errores?busqueda=modal', '/errores?busqueda=modal'],
  ])('admite enlace interno %s', (input, expected) => {
    expect(classifyNotebookUrl(input)).toEqual({ kind: 'internal', href: expected });
  });

  it.each([
    'https://example.com/guide',
    'http://example.com/',
    'mailto:juan@example.com',
  ])('admite destino externo explícito %s', (input) => {
    expect(classifyNotebookUrl(input).kind).toBe('external');
  });

  it.each([
    '',
    '//evil.example/path',
    'https:\\evil.example',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///C:/private.txt',
    'mailto:',
    'https://example.com/\nscript',
  ])('rechaza URL insegura %s', (input) => {
    expect(classifyNotebookUrl(input)).toEqual({ kind: 'invalid' });
  });
});
