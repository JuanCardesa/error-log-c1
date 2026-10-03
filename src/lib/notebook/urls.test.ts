import { describe, expect, it } from 'vitest';

import { classifyNotebookUrl, notebookNoteHref, parseNotebookNoteId } from './urls';

describe('URLs de Notebook', () => {
  it('mantiene el ID en la URL aunque cambie el título', () => {
    const oldHref = notebookNoteHref({ id: 42, title: 'Past modal verbs' });
    const renamedHref = notebookNoteHref({ id: 42, title: 'Modal verbs in the past' });
    expect(oldHref).toBe('/notebook/42-past-modal-verbs');
    expect(renamedHref).toBe('/notebook/42-modal-verbs-in-the-past');
    expect(parseNotebookNoteId(oldHref.split('/').at(-1) ?? '')).toBe(42);
    expect(parseNotebookNoteId(renamedHref.split('/').at(-1) ?? '')).toBe(42);
  });

  it.each(['42', '42-past-modal-verbs', '42-título-anterior'])(
    'resuelve el ID de %s independientemente del sufijo', (key) => {
      expect(parseNotebookNoteId(key)).toBe(42);
    },
  );

  it.each(['', '0', '-42', '42foo', 'nuevo', '9007199254740992-note'])(
    'rechaza una ruta sin ID válido: %s', (key) => {
      expect(parseNotebookNoteId(key)).toBeNull();
    },
  );

  it.each([
    ['#nb-must-have', '#nb-must-have'],
    ['/notebook/42-past-modal-verbs', '/notebook/42-past-modal-verbs'],
    ['../errores?busqueda=modal', '/errores?busqueda=modal'],
  ])('admite enlace interno %s', (input, expected) => {
    expect(classifyNotebookUrl(input)).toEqual({ kind: 'internal', href: expected });
  });

  it('resuelve enlaces relativos desde el apunte actual', () => {
    expect(classifyNotebookUrl('?vista=lectura#nb-ejemplo', '/notebook/42-past-modal-verbs'))
      .toEqual({ kind: 'internal', href: '/notebook/42-past-modal-verbs?vista=lectura#nb-ejemplo' });
    expect(classifyNotebookUrl('#nb-ejemplo', '/notebook/42-past-modal-verbs'))
      .toEqual({ kind: 'internal', href: '#nb-ejemplo' });
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
