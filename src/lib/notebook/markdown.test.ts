import { describe, expect, it } from 'vitest';

import { analyzeNotebookMarkdown, normalizeNotebookSearchText } from './markdown';

describe('análisis Markdown compartido', () => {
  it('extrae H1–H6 y anchors únicos, incluidos Unicode y títulos vacíos', () => {
    const analysis = analyzeNotebookMarkdown([
      '# Past deduction',
      '## Must **have**',
      '### Must have',
      '#### Condición',
      '##### 😀',
      '###### 😀',
    ].join('\n\n'));

    expect(analysis.headings).toEqual([
      { depth: 1, text: 'Past deduction', slug: 'nb-past-deduction' },
      { depth: 2, text: 'Must have', slug: 'nb-must-have' },
      { depth: 3, text: 'Must have', slug: 'nb-must-have-1' },
      { depth: 4, text: 'Condición', slug: 'nb-condición' },
      { depth: 5, text: '😀', slug: 'nb-section-5' },
      { depth: 6, text: '😀', slug: 'nb-section-6' },
    ]);
  });

  it('ignora encabezados y enlaces aparentes dentro de código y HTML', () => {
    const analysis = analyzeNotebookMarkdown([
      '```md',
      '# No es un encabezado',
      '[Tampoco](/notebook/1)',
      '```',
      '<h2>Sin HTML</h2>',
      '',
      '## Sí es un encabezado',
    ].join('\n'));

    expect(analysis.headings).toEqual([
      { depth: 2, text: 'Sí es un encabezado', slug: 'nb-sí-es-un-encabezado' },
    ]);
    expect(analysis.links).toEqual([]);
    expect(analysis.searchText).toContain('no es un encabezado');
    expect(analysis.searchText).not.toContain('sin html');
  });

  it('produce texto buscable sin sintaxis ni URLs, con formato GFM', () => {
    const analysis = analyzeNotebookMarkdown([
      'Must **have** y ~~might~~ *have*.',
      '',
      '| Regla | Ejemplo |',
      '| --- | --- |',
      '| [Ver](https://example.com) | can\'t have |',
      '',
      '- [x] Practicar',
    ].join('\n'));

    expect(analysis.searchText).toContain('must have y might have.');
    expect(analysis.searchText).toContain("regla ejemplo ver can't have");
    expect(analysis.searchText).toContain('practicar');
    expect(analysis.searchText).not.toContain('https://');
    expect(analysis.links).toEqual([{ text: 'Ver', url: 'https://example.com' }]);
  });

  it('resuelve enlaces de referencia y mantiene el orden', () => {
    const analysis = analyzeNotebookMarkdown([
      '[Conditionals][c] y [Past](/notebook/42-past-modal-verbs#nb-must-have)',
      '',
      '[c]: /notebook/57-conditionals',
    ].join('\n'));
    expect(analysis.links).toEqual([
      { text: 'Conditionals', url: '/notebook/57-conditionals' },
      { text: 'Past', url: '/notebook/42-past-modal-verbs#nb-must-have' },
    ]);
  });

  it('normaliza acentos, espacios, caja y apóstrofos para la búsqueda', () => {
    expect(normalizeNotebookSearchText('  MÚST\n  HAVE  —  can’t  '))
      .toBe("must have — can't");
  });
});
