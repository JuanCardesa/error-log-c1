import type { NotebookHeading } from './types';

export interface NotebookTocNode {
  readonly heading: NotebookHeading;
  readonly children: readonly NotebookTocNode[];
}

interface MutableTocNode {
  heading: NotebookHeading;
  children: MutableTocNode[];
}

/** Cada encabezado cuelga del precedente más cercano de menor profundidad. */
export function buildNotebookToc(headings: readonly NotebookHeading[]): readonly NotebookTocNode[] {
  const roots: MutableTocNode[] = [];
  const stack: MutableTocNode[] = [];
  for (const heading of headings) {
    while (stack.length > 0 && (stack.at(-1)?.heading.depth ?? 0) >= heading.depth) stack.pop();
    const node: MutableTocNode = { heading, children: [] };
    const parent = stack.at(-1);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
    stack.push(node);
  }
  return roots;
}
