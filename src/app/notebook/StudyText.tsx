'use client';

import { createContext, useContext } from 'react';
import type { StudySegment } from '@/lib/notebook/annotations';
import styles from './study.module.css';

export const StudyMarksContext = createContext<readonly StudySegment[]>([]);

export function StudyText({ start, text }: { readonly start: number; readonly text: string }) {
  const segments = useContext(StudyMarksContext);
  const end = start + text.length;
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (segments[mid]!.end <= start) low = mid + 1;
    else high = mid;
  }
  const children = [];
  let cursor = start;
  for (let index = low; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.start >= end) break;
    const from = Math.max(start, segment.start);
    const to = Math.min(end, segment.end);
    if (cursor < from) children.push(text.slice(cursor - start, from - start));
    const Tag = segment.highlight ? 'mark' : 'span';
    children.push(<Tag key={from} className={styles.mark} data-study-color={segment.color ?? undefined}
      data-study-highlight={segment.highlight || undefined}>{text.slice(from - start, to - start)}</Tag>);
    cursor = to;
  }
  if (cursor < end) children.push(text.slice(cursor - start));
  return <span data-study-start={start}>{children}</span>;
}
