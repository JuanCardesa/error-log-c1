import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import { MarkdownRenderer } from './MarkdownRenderer';

function render(markdown: string, basePath = '/notebook/42-example', hideFirstH1 = false): string {
  return renderToStaticMarkup(createElement(MarkdownRenderer, { markdown, basePath, hideFirstH1 }));
}

describe('MarkdownRenderer', () => {
  it('comparte los IDs de encabezados con el análisis, incluso con formato y duplicados', () => {
    const source = [
      '# Past **deduction**',
      '## Must *have*',
      '## Must have',
      '```md',
      '# Falso encabezado',
      '```',
      '### 😀',
    ].join('\n\n');
    const headings = analyzeNotebookMarkdown(source).headings;
    const html = render(source);
    for (const heading of headings) expect(html).toContain(`id="${heading.slug}"`);
    expect(html).not.toContain('id="nb-falso-encabezado"');
    expect(html).toContain('<strong>deduction</strong>');
  });

  it('permite al lector mostrar una sola vez el primer H1 que repite el título', () => {
    const source = '# Past modal verbs\n\n## Must have';
    const html = render(source, '/notebook/42-past-modal-verbs', true);
    expect(html).not.toContain('<h1');
    expect(html).toContain('id="nb-must-have"');
    expect(analyzeNotebookMarkdown(source).headings[0]?.slug).toBe('nb-past-modal-verbs');
  });

  it('omite HTML y deja los protocolos inseguros como texto sin enlace', () => {
    const html = render([
      '<script>alert("xss")</script>',
      '<iframe src="https://evil.example/"></iframe>',
      '[JS](javascript:alert(1)) [datos](data:text/html,evil) [archivo](file:///secret)',
      '[red](//evil.example/) [local](#nb-must-have)',
      '[seguro](https://example.com/guide) [correo](mailto:juan@example.com)',
    ].join('\n\n'));
    expect(html).not.toMatch(/<script|<iframe|javascript:|data:text\/html|file:\/\//u);
    expect(html).toContain('<span>JS</span>');
    expect(html).toContain('<span>datos</span>');
    expect(html).toContain('<span>archivo</span>');
    expect(html).toContain('<span>red</span>');
    expect(html).toContain('href="#nb-must-have"');
    expect(html).toContain('href="https://example.com/guide"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:juan@example.com"');
  });

  it('renderiza tablas, tareas deshabilitadas y código sin ejecutarlo', () => {
    const html = render([
      '| Regla | Ejemplo |',
      '| --- | --- |',
      '| modal | must have |',
      '',
      '- [x] Repasar',
      '- [ ] Practicar',
      '',
      '```html',
      '<img src="https://tracker.example/pixel.png">',
      '```',
    ].join('\n'));
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Regla</th>');
    expect(html).toContain('type="checkbox"');
    expect(html.match(/disabled=""/gu)).toHaveLength(2);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=');
  });

  it('conserva la sintaxis de imágenes sin generar solicitudes de imagen', () => {
    const html = render('![gráfico](https://tracker.example/pixel.png "remoto")');
    expect(html).not.toContain('<img');
    expect(html).toContain('![gráfico](https://tracker.example/pixel.png &quot;remoto&quot;)');
  });

  it('resuelve enlaces relativos desde el apunte, incluidos los fragmentos', () => {
    const html = render('[otra vista](?modo=compacto#nb-regla) [sección](#nb-regla)');
    expect(html).toContain('href="/notebook/42-example?modo=compacto#nb-regla"');
    expect(html).toContain('href="#nb-regla"');
  });
});
