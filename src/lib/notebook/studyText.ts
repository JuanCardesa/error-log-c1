import type { Nodes, Root, Text } from 'mdast';

const blocks = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'tableCell', 'tableRow']);
const excluded = new Set(['code', 'inlineCode', 'image', 'imageReference', 'footnoteReference', 'footnoteDefinition']);
export const STUDY_BARRIER = '\uFFFC';

/** Compartido entre persistencia y renderer: entidades, énfasis y enlaces tienen los mismos offsets. */
export function studyTextIndex(tree: Root): { text: string; leaves: Map<Text, number> } {
  let text = '';
  const leaves = new Map<Text, number>();
  function visit(node: Nodes) {
    if (excluded.has(node.type)) { text += STUDY_BARRIER; return; }
    if (node.type === 'html' || node.type === 'definition') return;
    if (node.type === 'text') { leaves.set(node, text.length); text += node.value; }
    else if (node.type === 'break') text += '\n';
    else if ('children' in node) node.children.forEach(visit);
    if (blocks.has(node.type)) text += '\n';
  }
  visit(tree);
  return { text, leaves };
}

/** Solo spans creados por la app. El HTML escrito en la nota sigue deshabilitado. */
export function remarkStudyText() {
  return (tree: Root) => {
    const { leaves } = studyTextIndex(tree);
    for (const [node, start] of leaves) {
      // mdast-util-to-hast respeta hName/hChildren también para nodos de texto.
      node.data = { ...node.data, hName: 'span', hProperties: { 'data-study-start': start },
        hChildren: [{ type: 'text', value: node.value }] };
    }
  };
}
