import { describe, expect, it } from 'vitest';

import { formatNotebookSelection as format } from './editorFormatting';

describe('toolbar Notebook', () => {
  it('envuelve solo la selección y la mantiene para seguir escribiendo', () => {
    expect(format('Antes regla después', 6, 11, 'bold')).toEqual({
      value: 'Antes **regla** después', selectionStart: 8, selectionEnd: 13,
    });
    expect(format('Hola', 4, 4, 'italic')).toEqual({
      value: 'Hola*texto*', selectionStart: 5, selectionEnd: 10,
    });
  });

  it('antepone marcadores a todas las líneas elegidas sin tocar las demás', () => {
    expect(format('uno\ndos\ntres', 4, 7, 'list')).toEqual({
      value: 'uno\n- dos\ntres', selectionStart: 6, selectionEnd: 9,
    });
    expect(format('uno\ndos\ntres', 4, 12, 'quote')).toEqual({
      value: 'uno\n> dos\n> tres', selectionStart: 6, selectionEnd: 16,
    });
    expect(format('uno\ndos\ntres', 4, 8, 'heading')).toEqual({
      value: 'uno\n## dos\ntres', selectionStart: 7, selectionEnd: 11,
    });
  });

  it('deja el cursor en la URL nueva y usa el texto seleccionado como etiqueta', () => {
    expect(format('Ver regla aquí', 4, 9, 'link')).toEqual({
      value: 'Ver [regla](https://) aquí', selectionStart: 12, selectionEnd: 20,
    });
  });
});
