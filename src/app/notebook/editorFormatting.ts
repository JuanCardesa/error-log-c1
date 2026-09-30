export type Formatting = 'heading' | 'bold' | 'italic' | 'list' | 'quote' | 'link';

export interface FormattingResult {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** Pure textarea edit so toolbar buttons preserve the user's exact selection. */
export function formatNotebookSelection(
  value: string,
  start: number,
  end: number,
  kind: Formatting,
): FormattingResult {
  const selected = value.slice(start, end);
  let replacement: string;
  let selectionStart: number;
  let selectionEnd: number;

  if (kind === 'bold' || kind === 'italic') {
    const marker = kind === 'bold' ? '**' : '*';
    replacement = `${marker}${selected || 'texto'}${marker}`;
    selectionStart = start + marker.length;
    selectionEnd = selectionStart + (selected || 'texto').length;
  } else if (kind === 'link') {
    replacement = `[${selected || 'texto del enlace'}](https://)`;
    selectionStart = selected ? start + replacement.length - 1 - 'https://'.length : start + 1;
    selectionEnd = selected ? selectionStart + 'https://'.length : selectionStart + 'texto del enlace'.length;
  } else {
    const prefix = kind === 'heading' ? '## ' : kind === 'list' ? '- ' : '> ';
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end > start ? end - 1 : end);
    const actualEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, actualEnd);
    const lines = block.split('\n');
    const formatted = lines.map((line) => `${prefix}${line}`).join('\n');
    const addedBeforeStart = prefix.length * (block.slice(0, start - lineStart).split('\n').length);
    const addedBeforeEnd = prefix.length * (block.slice(0, end - lineStart).split('\n').length);
    return {
      value: `${value.slice(0, lineStart)}${formatted}${value.slice(actualEnd)}`,
      selectionStart: start + addedBeforeStart,
      selectionEnd: end + addedBeforeEnd,
    };
  }

  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart,
    selectionEnd,
  };
}
