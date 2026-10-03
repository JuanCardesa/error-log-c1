import { describe, expect, it } from 'vitest';

import { rewriteNotebookLinks } from './export';
import { notebookLinkSpans } from './markdown';

const PATHS = new Map([
  [42, 'grammar--1/modal-verbs--3/42-past-modals.md'],
  [7, 'vocabulary--2/7-collocations.md'],
  [9, '9-sin-carpeta.md'],
]);
const pathOf = (id: number) => PATHS.get(id);

function rewrite(markdown: string, fromPath = 'grammar--1/modal-verbs--3/50-origen.md') {
  return rewriteNotebookLinks(markdown, { fromPath, pathOf });
}

describe('localización del destino', () => {
  it.each([
    ['enlace normal', '[a](/notebook/42-x)', '/notebook/42-x'],
    ['con ancla', '[a](/notebook/42-x#nb-h)', '/notebook/42-x#nb-h'],
    ['entre ángulos', '[a](</notebook/42-x>)', '/notebook/42-x'],
    ['con título', '[a](/notebook/42-x "titulo")', '/notebook/42-x'],
    ['corchetes en el texto', '[a [b] c](/notebook/42-x)', '/notebook/42-x'],
    ['definición', '[ref]: /notebook/42-x#nb-h', '/notebook/42-x#nb-h'],
    ['autoenlace', '<https://example.com/a>', 'https://example.com/a'],
    ['solo ancla', '[a](#nb-must-have)', '#nb-must-have'],
  ])('%s', (_name, markdown, url) => {
    const spans = notebookLinkSpans(markdown);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.url).toBe(url);
    // El tramo señala exactamente la URL dentro del original.
    expect(markdown.slice(spans[0]?.start ?? 0, spans[0]?.end ?? 0)).toBe(url);
  });

  it('no ve enlaces dentro de código ni texto suelto', () => {
    expect(notebookLinkSpans('`[no](/notebook/9-x)`')).toEqual([]);
    expect(notebookLinkSpans('    [no](/notebook/9-x)\n')).toEqual([]);
    // CommonMark solo admite autoenlaces con esquema: esto es texto, no un destino.
    expect(notebookLinkSpans('</notebook/42-x>')).toEqual([]);
  });
});

describe('reescritura para el ZIP', () => {
  it('convierte un enlace a otro apunte en una ruta relativa con ancla de GitHub', () => {
    expect(rewrite('Ver [modales](/notebook/42-past-modals#nb-must-have).').markdown)
      .toBe('Ver [modales](./42-past-modals.md#must-have).');
  });

  it('sube y baja por el árbol según dónde esté cada apunte', () => {
    expect(rewrite('[v](/notebook/7-collocations)').markdown).toBe('[v](../../vocabulary--2/7-collocations.md)');
    expect(rewrite('[s](/notebook/9-sin-carpeta)').markdown).toBe('[s](../../9-sin-carpeta.md)');
    expect(rewrite('[m](/notebook/42-past-modals)', 'vocabulary--2/7-collocations.md').markdown)
      .toBe('[m](../grammar--1/modal-verbs--3/42-past-modals.md)');
  });

  it('el sufijo del enlace no tiene que coincidir: manda el ID', () => {
    expect(rewrite('[x](/notebook/42-titulo-viejo)').markdown).toBe('[x](./42-past-modals.md)');
    expect(rewrite('[x](/notebook/42)').markdown).toBe('[x](./42-past-modals.md)');
  });

  it('un ancla del propio apunte pierde el prefijo del lector', () => {
    const result = rewrite('[aquí](#nb-must-have) y [otra](#ya-github)');
    expect(result.markdown).toBe('[aquí](#must-have) y [otra](#ya-github)');
    expect(result.rewritten).toBe(1);
  });

  it('deja intactos los enlaces externos, los inválidos y los que no son apuntes', () => {
    const markdown = [
      '[web](https://example.com/notebook/42-x)',
      '[correo](mailto:a@b.com)',
      '[malo](javascript:alert(1))',
      '[portada](/notebook)',
      '[carpeta](/notebook?carpeta=3)',
      '[otra app](/errores?error=5)',
    ].join('\n\n');
    expect(rewrite(markdown)).toMatchObject({ markdown, rewritten: 0, unresolved: 0 });
  });

  it('un apunte que no está en la exportación se queda como estaba y se cuenta', () => {
    const result = rewrite('[borrado](/notebook/999-x#nb-h)');
    expect(result).toMatchObject({ markdown: '[borrado](/notebook/999-x#nb-h)', rewritten: 0, unresolved: 1 });
  });

  it('reescribe varios enlaces de una línea sin descolocar los offsets', () => {
    expect(rewrite('[a](/notebook/42-x) y [b](/notebook/7-y#nb-dos) y [c](#nb-tres)').markdown)
      .toBe('[a](./42-past-modals.md) y [b](../../vocabulary--2/7-collocations.md#dos) y [c](#tres)');
  });

  it('conserva el resto del documento tal cual', () => {
    const markdown = [
      '# Título con [corchetes]',
      '',
      '| a | b |', '| --- | --- |', '| `[x](/notebook/42-x)` | 2 |',
      '',
      '> cita con [enlace](/notebook/42-x)',
      '',
      '```md', '[no](/notebook/7-y)', '```',
      '',
      '[ref]: /notebook/7-y',
    ].join('\n');
    const result = rewrite(markdown);
    expect(result.markdown).toContain('| `[x](/notebook/42-x)` | 2 |');
    expect(result.markdown).toContain('```md\n[no](/notebook/7-y)\n```');
    expect(result.markdown).toContain('> cita con [enlace](./42-past-modals.md)');
    expect(result.markdown).toContain('[ref]: ../../vocabulary--2/7-collocations.md');
    expect(result.rewritten).toBe(2);
  });

  it('un documento sin enlaces internos no se toca', () => {
    const markdown = '# Solo texto\n\nNada que reescribir.\n';
    expect(rewrite(markdown).markdown).toBe(markdown);
  });
});
