import { describe, expect, it } from 'vitest';

import {
  analyzeNotebookMarkdown, findNotebookMarkdownExcerpt, findNotebookTextMatch, normalizeNotebookSearchText,
} from './markdown';

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

describe('fragmentos de búsqueda Notebook', () => {
  it('encuentra una frase con formato bajo el encabezado precedente', () => {
    const excerpt = findNotebookMarkdownExcerpt([
      '# Past deduction',
      'Introducción.',
      '',
      '## Must have',
      'He **must have** forgotten it.',
      '',
      '## Must have',
      'Otro apartado.',
    ].join('\n'), 'must have forgotten');
    expect(excerpt?.heading?.slug).toBe('nb-must-have');
    expect(excerpt?.text.slice(excerpt.match.start, excerpt.match.end)).toBe('must have forgotten');
  });

  it('selecciona el apartado repetido cuando ahí aparece la primera coincidencia', () => {
    const excerpt = findNotebookMarkdownExcerpt([
      '## Regla',
      'Texto distinto.',
      '',
      '## Regla',
      'La deducción ocurre aquí.',
    ].join('\n'), 'deduccion');
    expect(excerpt?.heading?.slug).toBe('nb-regla-1');
    expect(excerpt?.text.slice(excerpt.match.start, excerpt.match.end)).toBe('deducción');
  });

  it('resalta acentos, caja y apóstrofos sin perder los caracteres originales', () => {
    const value = 'La Deducción dice can’t have.';
    const accent = findNotebookTextMatch(value, 'deduccion');
    const apostrophe = findNotebookTextMatch(value, "can't have");
    expect(value.slice(accent?.start, accent?.end)).toBe('Deducción');
    expect(value.slice(apostrophe?.start, apostrophe?.end)).toBe('can’t have');
  });

  it('ignora HTML, indexa el texto alternativo y conserva el código como texto', () => {
    const source = '<script>secretoHtml</script>\n\n![gráfico](https://example.com)\n\n```txt\nMust have\n```';
    expect(findNotebookMarkdownExcerpt(source, 'secretoHtml')).toBeNull();
    expect(findNotebookMarkdownExcerpt(source, 'grafico')?.text).toContain('gráfico');
    expect(findNotebookMarkdownExcerpt(source, 'must have')?.text).toContain('Must have');
  });
});
