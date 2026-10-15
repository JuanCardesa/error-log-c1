'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { AnnotationFocus, AnnotationKind, AnnotationScope, Corrector } from '@/lib/domain/enums';
import type { StudyAnchor } from '@/lib/notebook/annotations';
import { paragraphsOf } from '@/lib/writing/text';

import styles from './writing.module.css';
import ui from '../_shared/ui.module.css';

interface Annotation {
  readonly id: string;
  readonly kind: AnnotationKind;
  readonly focus: AnnotationFocus | null;
  readonly source: Corrector;
  readonly scope: AnnotationScope;
  readonly anchor: StudyAnchor | null;
  readonly paragraph: number | null;
  readonly quote: string | null;
  readonly comment: string | null;
  readonly suggestion: string | null;
  readonly reviewedAt: string | null;
}

type Labels = {
  readonly wordCount: string;
  readonly annotated: string;
  readonly clean: string;
  readonly annotationsOne: string;
  readonly annotationsMany: string;
  readonly closeAnnotations: string;
  readonly annotationPanel: string;
  readonly filterType: string;
  readonly allKinds: string;
  readonly pendingOnly: string;
  readonly wholeText: string;
  readonly paragraphPrefix: string;
  readonly noAnnotations: string;
  readonly noAnnotationsYet: string;
  readonly reviewed: string;
  readonly unreviewed: string;
  readonly previous: string;
  readonly next: string;
  readonly jump: string;
  readonly kind: Readonly<Record<AnnotationKind, string>>;
  readonly source: Readonly<Record<Corrector, string>>;
  readonly focus: Readonly<Record<AnnotationFocus, string>>;
};

const KINDS: readonly AnnotationKind[] = ['ERROR', 'IMPROVEMENT', 'STRENGTH', 'COMMENT'];
const kindClass: Readonly<Record<AnnotationKind, string>> = {
  ERROR: styles.markError ?? 'markError',
  IMPROVEMENT: styles.markImprovement ?? 'markImprovement',
  STRENGTH: styles.markStrength ?? 'markStrength',
  COMMENT: styles.markComment ?? 'markComment',
};

function exactAnchor(annotation: Annotation, text: string): StudyAnchor | null {
  const anchor = annotation.anchor;
  return annotation.scope === 'SPAN' && anchor !== null && anchor.start >= 0 && anchor.end <= text.length
    && anchor.end > anchor.start && text.slice(anchor.start, anchor.end) === anchor.exact ? anchor : null;
}

export function WritingReadingView({ text, annotations, labels }: {
  readonly text: string;
  readonly annotations: readonly Annotation[];
  readonly labels: Labels;
}) {
  const [clean, setClean] = useState(false);
  const [kind, setKind] = useState<AnnotationKind | 'ALL'>('ALL');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const paragraphs = useMemo(() => paragraphsOf(text), [text]);
  const paragraphLabel = (number: number) => `${labels.paragraphPrefix}${String(number)}`;
  const annotationLabel = (count: number) => (count === 1 ? labels.annotationsOne : labels.annotationsMany).replace('{count}', String(count));
  const valid = useMemo(() => annotations.map((item) => ({ item, anchor: exactAnchor(item, text) })), [annotations, text]);
  const visible = valid.filter(({ item }) => (kind === 'ALL' || item.kind === kind) && (!pendingOnly || item.reviewedAt === null));
  const selectedAnnotation = visible.find(({ item }) => item.id === selected)?.item ?? null;

  useEffect(() => {
    if (!drawerOpen) return;
    panelRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [drawerOpen]);

  function choose(id: string) {
    setSelected(id);
    setDrawerOpen(true);
  }

  function move(delta: number) {
    if (visible.length === 0) return;
    const index = visible.findIndex(({ item }) => item.id === selected);
    const next = (index + delta + visible.length) % visible.length;
    const annotation = visible[next];
    if (annotation !== undefined) choose(annotation.item.id);
  }

  function renderParagraph(paragraph: (typeof paragraphs)[number]) {
    const related = visible.flatMap(({ item, anchor }) => {
      if (anchor !== null && anchor.start < paragraph.end && anchor.end > paragraph.start) {
        return [{ item, start: Math.max(anchor.start, paragraph.start), end: Math.min(anchor.end, paragraph.end) }];
      }
      if (item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number) {
        return [{ item, start: paragraph.start, end: paragraph.end }];
      }
      return [];
    });
    const points = [...new Set([paragraph.start, paragraph.end, ...related.flatMap((item) => [item.start, item.end])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((start) => {
      const end = points[points.indexOf(start) + 1] ?? paragraph.end;
      const covering = related.filter((item) => item.start < end && item.end > start);
      const ids = covering.map((item) => item.item.id);
      const primary = covering[0]?.item;
      return primary === undefined
        ? <span key={`${paragraph.number}-${start}`}>{text.slice(start, end)}</span>
        : <mark key={`${paragraph.number}-${start}`} className={kindClass[primary.kind]}
          data-annotation-ids={ids.join(' ')} data-selected={ids.includes(selected ?? '') ? 'true' : undefined}
          role="button" tabIndex={0} aria-label={`${labels.kind[primary.kind]}${primary.focus === null ? '' : ` · ${labels.focus[primary.focus]}`}`}
          onClick={() => choose(primary.id)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(primary.id); }
          }}>{text.slice(start, end)}</mark>;
    });
  }

  return (
    <div className={styles.readingLayout}>
      <section className={styles.readingMain} aria-label={labels.annotated}>
        <div className={styles.readingToolbar}>
          <p className={styles.wordCount} aria-live="polite">{labels.wordCount}</p>
          <div className={ui.segmented} role="group" aria-label={labels.annotated}>
            <button type="button" className={ui.segment} aria-pressed={!clean} onClick={() => setClean(false)}>{labels.annotated}</button>
            <button type="button" className={ui.segment} aria-pressed={clean} onClick={() => setClean(true)}>{labels.clean}</button>
          </div>
          <button type="button" className={`${ui.secondary} ${ui.compact} ${styles.mobileAnnotations}`}
            onClick={() => setDrawerOpen(true)}>{annotationLabel(visible.length)}</button>
        </div>
        <div ref={textRef} className={`${styles.text} ${clean ? styles.cleanText : ''}`} data-reading-mode={clean ? 'clean' : 'annotated'}>
          {paragraphs.map((paragraph) => <p key={paragraph.number} data-paragraph={paragraph.number}>
            <span className={styles.paragraphText}>{renderParagraph(paragraph)}</span>
            {visible.some(({ item }) => item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number)
              && <button type="button" className={styles.paragraphButton} aria-label={paragraphLabel(paragraph.number)}
                onClick={() => {
                  const found = visible.find(({ item }) => item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number);
                  if (found !== undefined) choose(found.item.id);
                }}>¶</button>}
          </p>)}
        </div>
      </section>
      <aside ref={panelRef} tabIndex={-1} className={`${styles.annotationPanel} ${drawerOpen ? styles.annotationPanelOpen : ''}`}
        aria-label={labels.annotationPanel} aria-modal={drawerOpen ? true : undefined} role={drawerOpen ? 'dialog' : 'region'}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drawerOpen) { event.preventDefault(); setDrawerOpen(false); }
          else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') { event.preventDefault(); move(1); }
          else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') { event.preventDefault(); move(-1); }
          else if (event.key === 'Enter' && selected !== null) {
            const target = textRef.current?.querySelector(`[data-annotation-ids~="${CSS.escape(selected)}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}>
        <header className={styles.annotationHead}>
          <h2>{labels.annotationPanel}</h2>
          <button type="button" className={`${ui.iconButton} ${ui.iconBordered} ${styles.closeAnnotations}`}
            aria-label={labels.closeAnnotations} onClick={() => setDrawerOpen(false)}>×</button>
        </header>
        <label className={styles.annotationFilter}>{labels.filterType}
          <select id="writing-annotation-kind" value={kind} onChange={(event) => setKind(event.target.value as AnnotationKind | 'ALL')}>
            <option value="ALL">{labels.allKinds}</option>
            {KINDS.map((entry) => <option key={entry} value={entry}>{labels.kind[entry]}</option>)}
          </select>
        </label>
        <label className={styles.pendingFilter}><input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />{labels.pendingOnly}</label>
        {annotations.length === 0 ? <p className={ui.help}>{labels.noAnnotationsYet}</p>
          : visible.length === 0 ? <p className={ui.help}>{labels.noAnnotations}</p>
            : <ul className={styles.annotationList} role="listbox" aria-label={labels.annotationPanel}>
              {visible.map(({ item, anchor }, index) => (
                <li key={item.id}>
                  <button type="button" role="option" aria-selected={selected === item.id}
                    className={`${styles.annotationCard} ${selected === item.id ? styles.annotationSelected : ''}`}
                    onClick={() => choose(item.id)} onFocus={() => setSelected(item.id)}>
                    <span className={styles.annotationCardTop}><strong>{labels.kind[item.kind]}</strong>
                      <span>{item.source === 'IA' ? `${labels.source[item.source]} · AI suggestion` : labels.source[item.source]}</span></span>
                    {item.focus !== null && <span className={styles.annotationFocus}>{labels.focus[item.focus]}</span>}
                    {item.scope === 'DOCUMENT' && <span className={styles.annotationTarget}>{labels.wholeText}</span>}
                    {item.scope === 'PARAGRAPH' && item.paragraph !== null && <span className={styles.annotationTarget}>{paragraphLabel(item.paragraph)}</span>}
                    {item.scope === 'SPAN' && <span className={styles.annotationTarget}>{anchor?.exact ?? item.quote ?? labels.noAnnotations}</span>}
                    {item.comment !== null && <span>{item.comment}</span>}
                    {item.suggestion !== null && <span className={styles.suggestion}>{item.suggestion}</span>}
                    <span className={styles.reviewStatus}>{item.reviewedAt === null ? labels.unreviewed : labels.reviewed}</span>
                    <span className="sr-only">{String(index + 1)} / {String(visible.length)}</span>
                  </button>
                </li>
              ))}
            </ul>}
        {selectedAnnotation !== null && <button type="button" className={`${ui.secondary} ${ui.compact}`}
          onClick={() => {
            const target = textRef.current?.querySelector(`[data-annotation-ids~="${CSS.escape(selectedAnnotation.id)}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setDrawerOpen(false);
          }}>{labels.jump}</button>}
        {visible.length > 0 && <div className={styles.annotationNavigation}>
          <button type="button" className={`${ui.secondary} ${ui.compact}`} aria-label={labels.previous} onClick={() => move(-1)}>↑</button>
          <span>{String(Math.max(visible.findIndex(({ item }) => item.id === selected) + 1, 1))} / {String(visible.length)}</span>
          <button type="button" className={`${ui.secondary} ${ui.compact}`} aria-label={labels.next} onClick={() => move(1)}>↓</button>
        </div>}
      </aside>
      {drawerOpen && <button type="button" className={styles.annotationScrim} aria-label={labels.closeAnnotations}
        onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
