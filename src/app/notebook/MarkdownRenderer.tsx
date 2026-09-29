import type { ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { analyzeNotebookMarkdown, type NotebookMarkdownAnalysis } from '@/lib/notebook/markdown';
import { classifyNotebookUrl } from '@/lib/notebook/urls';
import styles from './markdown.module.css';

const allowedElements = [
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'input', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td',
  'th', 'thead', 'tr', 'ul',
];

const remarkPlugins = [remarkGfm];
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Una única política para lectura y futura vista previa. Nunca interpreta HTML ni carga imágenes. */
export function MarkdownRenderer({ markdown, basePath = '/notebook/', hideFirstH1 = false, analysis: given }: {
  readonly markdown: string;
  readonly basePath?: string;
  /** El lector coloca el mismo anchor en el título cuando el primer H1 lo repite. */
  readonly hideFirstH1?: boolean;
  /** El lector ya analizó este Markdown para el índice: sin repetirlo, un parseo menos por visita. */
  readonly analysis?: NotebookMarkdownAnalysis;
}) {
  const analysis = given ?? analyzeNotebookMarkdown(markdown);
  const headingByOffset = new Map(analysis.headingOffsets.map((offset, index) => [offset, analysis.headings[index]?.slug]));

  const renderHeading = (Tag: HeadingTag) => function NotebookHeading({ node, children }: {
    readonly node?: ExtraProps['node'];
    readonly children?: ReactNode;
  }) {
    const offset = node?.position?.start.offset;
    if (Tag === 'h1' && hideFirstH1 && offset === analysis.headingOffsets[0]) return null;
    const id = offset === undefined ? undefined : headingByOffset.get(offset);
    return <Tag id={id}>{children}</Tag>;
  };

  const components: Components = {
    h1: renderHeading('h1'),
    h2: renderHeading('h2'),
    h3: renderHeading('h3'),
    h4: renderHeading('h4'),
    h5: renderHeading('h5'),
    h6: renderHeading('h6'),
    a: ({ href, children }) => {
      const target = classifyNotebookUrl(href ?? '', basePath);
      if (target.kind === 'invalid') return <span>{children}</span>;
      if (target.kind === 'internal') return <a href={target.href}>{children}</a>;
      return (
        <a href={target.href} rel="noopener noreferrer" target={target.href.startsWith('mailto:') ? undefined : '_blank'}>
          {children}
        </a>
      );
    },
    img: ({ node, alt }) => {
      const start = node?.position?.start.offset;
      const end = node?.position?.end.offset;
      const source = start === undefined || end === undefined ? `![${alt ?? ''}]` : markdown.slice(start, end);
      return <code className={styles.imageSyntax}>{source}</code>;
    },
    input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} disabled aria-label={checked ? 'Tarea completada' : 'Tarea pendiente'} />,
    table: ({ children }) => (
      <div className={styles.tableScroll} role="region" aria-label="Tabla del apunte" tabIndex={0}>
        <table>{children}</table>
      </div>
    ),
    ol: ({ start, children }) => <ol start={typeof start === 'number' && Number.isSafeInteger(start) && start > 0 ? start : undefined}>{children}</ol>,
  };

  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={remarkPlugins}
        skipHtml
        allowedElements={allowedElements}
        urlTransform={(url, key) => {
          if (key !== 'href') return '';
          const classified = classifyNotebookUrl(url, basePath);
          return classified.kind === 'invalid' ? '' : classified.href;
        }}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
