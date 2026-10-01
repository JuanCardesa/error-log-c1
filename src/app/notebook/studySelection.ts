import type { StudyRange } from '@/lib/notebook/annotations';
import { STUDY_BARRIER } from '@/lib/notebook/studyText';

export interface StudySelection extends StudyRange { readonly left: number; readonly top: number; readonly viewportHeight: number }

/** Los spans se indexan al montar el contenido. Las marcas interiores no invalidan este índice. */
export function readStudySelection(root: HTMLElement, leaves: readonly HTMLElement[], text: string): StudySelection | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  for (const element of root.querySelectorAll('code, pre, input, button, [data-footnote-ref], [data-footnote-backref]')) {
    if (range.intersectsNode(element)) return null;
  }
  let start: number | undefined;
  let end: number | undefined;
  for (const leaf of leaves) {
    if (!range.intersectsNode(leaf)) continue;
    const part = document.createRange();
    part.selectNodeContents(leaf);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    if (part.collapsed || part.toString() === '') continue;
    const prefix = document.createRange();
    prefix.selectNodeContents(leaf);
    prefix.setEnd(part.startContainer, part.startOffset);
    const offset = Number(leaf.dataset['studyStart']) + prefix.toString().length;
    start ??= offset;
    end = offset + part.toString().length;
  }
  if (start === undefined || end === undefined || end <= start || !text.slice(start, end).trim()
    || text.slice(start, end).includes(STUDY_BARRIER)) return null;
  const rect = range.getBoundingClientRect();
  return { start, end, viewportHeight: window.innerHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - 330)),
    top: rect.top >= 64 ? rect.top - 54 : Math.min(rect.bottom + 8, window.innerHeight - 60) };
}
