import { describe, expect, it } from 'vitest';

import type { NotebookHeading } from './types';
import { buildNotebookToc } from './toc';

describe('índice de Notebook', () => {
  it('anida bajo el encabezado precedente de menor profundidad incluso si salta niveles', () => {
    const headings: NotebookHeading[] = [
      { depth: 2, text: 'A', slug: 'nb-a' },
      { depth: 4, text: 'B', slug: 'nb-b' },
      { depth: 3, text: 'C', slug: 'nb-c' },
      { depth: 2, text: 'D', slug: 'nb-d' },
      { depth: 5, text: 'E', slug: 'nb-e' },
    ];
    const tree = buildNotebookToc(headings);
    expect(tree.map((node) => node.heading.slug)).toEqual(['nb-a', 'nb-d']);
    expect(tree[0]?.children.map((node) => node.heading.slug)).toEqual(['nb-b', 'nb-c']);
    expect(tree[1]?.children.map((node) => node.heading.slug)).toEqual(['nb-e']);
  });

  it('conserva los identificadores de encabezados repetidos', () => {
    const headings: NotebookHeading[] = [
      { depth: 1, text: 'Must have', slug: 'nb-must-have' },
      { depth: 2, text: 'Must have', slug: 'nb-must-have-1' },
    ];
    expect(buildNotebookToc(headings)[0]?.children[0]?.heading.slug).toBe('nb-must-have-1');
  });
});
