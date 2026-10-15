'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AnnotationFocus, AnnotationKind, AnnotationScope, Corrector } from '@/lib/domain/enums';
import type { StudyAnchor } from '@/lib/notebook/annotations';
import { paragraphsOf } from '@/lib/writing/text';
import {
  createWritingAnnotationAction,
  deleteWritingAnnotationAction,
  placeWritingAnnotationAction,
  restoreWritingAnnotationAction,
  reviewWritingAnnotationAction,
  updateWritingAnnotationAction,
} from './annotationActions';
import { WritingTranscriptionEditor } from './WritingTranscriptionEditor';

import styles from './writing.module.css';
import ui from '../_shared/ui.module.css';
import { useToast } from '../_shared/Toast';

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
  readonly kindLabel: string;
  readonly focusLabel: string;
  readonly allKinds: string;
  readonly pendingOnly: string;
  readonly wholeText: string;
  readonly needsPlacing: string;
  readonly paragraphPrefix: string;
  readonly noAnnotations: string;
  readonly noAnnotationsYet: string;
  readonly reviewed: string;
  readonly unreviewed: string;
  readonly previous: string;
  readonly next: string;
  readonly jump: string;
  readonly saving: string;
  readonly createAnnotation: string;
  readonly editAnnotation: string;
  readonly deleteAnnotation: string;
  readonly placeHere: string;
  readonly chooseCandidate: string;
  readonly comment: string;
  readonly suggestion: string;
  readonly savingSource: string;
  readonly missingAnnotation: string;
  readonly missingText: string;
  readonly invalidTarget: string;
  readonly staleAnchor: string;
  readonly restoreConflict: string;
  readonly invalidInput: string;
  readonly annotationSaved: string;
  readonly annotationPlaced: string;
  readonly annotationStudied: string;
  readonly annotationDeleted: string;
  readonly annotationRestored: string;
  readonly noMatches: string;
  readonly aiSuggestion: string;
  readonly markStudied: string;
  readonly saveAnnotation: string;
  readonly correctTranscription: string;
  readonly saveTranscription: string;
  readonly transcription: string;
  readonly cancel: string;
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

interface Selection { readonly start: number; readonly end: number; readonly paragraph: number }
interface Draft { readonly kind: AnnotationKind; readonly focus: AnnotationFocus | null; readonly source: Corrector; readonly comment: string; readonly suggestion: string }
const blankDraft: Draft = { kind: 'ERROR', focus: 'GRAMMAR', source: 'YO', comment: '', suggestion: '' };

function exactAnchor(annotation: Annotation, text: string): StudyAnchor | null {
  const anchor = annotation.anchor;
  return annotation.scope === 'SPAN' && anchor !== null && anchor.start >= 0 && anchor.end <= text.length
    && anchor.end > anchor.start && text.slice(anchor.start, anchor.end) === anchor.exact ? anchor : null;
}

export function WritingReadingView({ pieceId, text, annotations, labels }: {
  readonly pieceId: number;
  readonly text: string;
  readonly annotations: readonly Annotation[];
  readonly labels: Labels;
}) {
  const [clean, setClean] = useState(false);
  const [kind, setKind] = useState<AnnotationKind | 'ALL'>('ALL');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<'closed' | 'create' | 'edit'>('closed');
  const [scope, setScope] = useState<AnnotationScope>('SPAN');
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [working, setWorking] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const toast = useToast();
  const paragraphs = useMemo(() => paragraphsOf(text), [text]);
  const paragraphLabel = (number: number) => `${labels.paragraphPrefix}${String(number)}`;
  const annotationLabel = (count: number) => (count === 1 ? labels.annotationsOne : labels.annotationsMany).replace('{count}', String(count));
  const valid = useMemo(() => annotations.map((item) => ({ item, anchor: exactAnchor(item, text) })), [annotations, text]);
  const visible = valid.filter(({ item }) => (kind === 'ALL' || item.kind === kind) && (!pendingOnly || item.reviewedAt === null));
  const selectedAnnotation = visible.find(({ item }) => item.id === selected)?.item ?? null;
  const firstUnplaced = visible.findIndex(({ item, anchor }) => item.scope === 'SPAN' && anchor === null);

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

  function captureSelection() {
    const selectedText = window.getSelection();
    if (selectedText === null || selectedText.isCollapsed || selectedText.rangeCount === 0) { setSelection(null); return; }
    const range = selectedText.getRangeAt(0);
    const startParagraph = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-paragraph]');
    const endParagraph = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest<HTMLElement>('[data-paragraph]');
    if (startParagraph === null || startParagraph === undefined || startParagraph !== endParagraph) { setSelection(null); return; }
    const number = Number(startParagraph.dataset['paragraph']);
    const metadata = paragraphs.find((item) => item.number === number);
    const textElement = startParagraph.querySelector('.' + CSS.escape(styles.paragraphText ?? 'paragraphText'));
    if (metadata === undefined || textElement === null) { setSelection(null); return; }
    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(textElement);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(textElement);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const start = metadata.start + beforeStart.toString().length;
    const end = metadata.start + beforeEnd.toString().length;
    if (end <= start || text.slice(start, end).trim() === '') { setSelection(null); return; }
    setSelection({ start, end, paragraph: number });
  }

  function openCreate(nextScope: AnnotationScope, paragraph?: number) {
    setScope(nextScope);
    setDraft(blankDraft);
    setEditor('create');
    if (nextScope !== 'SPAN') setSelection(nextScope === 'PARAGRAPH' && paragraph !== undefined
      ? { start: 0, end: 0, paragraph } : null);
  }

  async function submitAnnotation() {
    if (working) return;
    setWorking(true);
    const content = { kind: draft.kind, focus: draft.focus, source: draft.source,
      comment: draft.comment.trim() || null, suggestion: draft.suggestion.trim() || null };
    const payload = editor === 'edit' && selectedAnnotation !== null
      ? { id: selectedAnnotation.id, ...content }
      : scope === 'DOCUMENT' ? { pieceId, scope, ...content }
        : scope === 'PARAGRAPH' && selection !== null ? { pieceId, scope, paragraph: selection.paragraph, ...content }
          : selection === null ? null : { pieceId, scope: 'SPAN' as const, start: selection.start, end: selection.end, ...content };
    const result = payload === null ? { ok: false as const, message: labels.invalidTarget }
      : editor === 'edit' ? await updateWritingAnnotationAction(payload) : await createWritingAnnotationAction(payload);
    setWorking(false);
    toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
    if (result.ok) { setEditor('closed'); setSelection(null); window.getSelection()?.removeAllRanges(); router.refresh(); }
  }

  async function removeAnnotation(annotation: Annotation) {
    const result = await deleteWritingAnnotationAction(annotation.id);
    if (!result.ok) { toast({ message: result.message, tone: 'error' }); return; }
    setSelected(null);
    toast({ message: result.message, undo: () => {
      void restoreWritingAnnotationAction(result.undoToken).then((restored) => {
        toast({ message: restored.message, tone: restored.ok ? 'ok' : 'error' });
        if (restored.ok) router.refresh();
      }).catch(() => toast({ message: labels.restoreConflict, tone: 'error' }));
    } });
    router.refresh();
  }

  async function placeAnnotation(id: string, start: number, end: number) {
    const result = await placeWritingAnnotationAction({ id, start, end });
    toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
    if (result.ok) { setSelected(id); router.refresh(); }
  }

  function quoteMatches(quote: string): readonly Selection[] {
    const found: Selection[] = [];
    const quoteAt = paragraphs.flatMap((paragraph) => {
      const indexes: Selection[] = [];
      let at = text.indexOf(quote, paragraph.start);
      while (at !== -1 && at < paragraph.end) {
        if (at + quote.length <= paragraph.end) indexes.push({ start: at, end: at + quote.length, paragraph: paragraph.number });
        at = text.indexOf(quote, at + 1);
      }
      return indexes;
    });
    found.push(...quoteAt);
    return found;
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
          <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => openCreate('DOCUMENT')}>{labels.wholeText}</button>
          <WritingTranscriptionEditor pieceId={pieceId} initialText={text} labels={{
            correct: labels.correctTranscription, save: labels.saveTranscription, transcription: labels.transcription,
            saving: labels.saving, cancel: labels.cancel,
          }} />
          {selection !== null && <button type="button" className={`${ui.secondary} ${ui.compact}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => {
              if (selectedAnnotation?.scope === 'SPAN' && selectedAnnotation.anchor === null) {
                void placeAnnotation(selectedAnnotation.id, selection.start, selection.end);
              } else openCreate('SPAN');
            }}>{selectedAnnotation?.scope === 'SPAN' && selectedAnnotation.anchor === null ? labels.placeHere : labels.createAnnotation}</button>}
        </div>
        {editor !== 'closed' && <section className={styles.annotationEditor} aria-label={editor === 'edit' ? labels.editAnnotation : labels.createAnnotation}>
          <div className={styles.annotationEditorField}><label htmlFor="writing-annotation-form-kind">{labels.kindLabel}</label>
            <select id="writing-annotation-form-kind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as AnnotationKind })}>
              {KINDS.map((entry) => <option key={entry} value={entry}>{labels.kind[entry]}</option>)}
            </select>
          </div>
          <div className={styles.annotationEditorField}><label htmlFor="writing-annotation-form-focus">{labels.focusLabel}</label>
            <select id="writing-annotation-form-focus" value={draft.focus ?? ''} onChange={(event) => setDraft({ ...draft, focus: event.target.value === '' ? null : event.target.value as AnnotationFocus })}>
              <option value="">—</option>
              {Object.entries(labels.focus).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select>
          </div>
          <div className={styles.annotationEditorField}><label htmlFor="writing-annotation-comment">{labels.comment}</label>
            <textarea id="writing-annotation-comment" value={draft.comment} maxLength={2000} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} />
          </div>
          <div className={styles.annotationEditorField}><label htmlFor="writing-annotation-suggestion">{labels.suggestion}</label>
            <textarea id="writing-annotation-suggestion" value={draft.suggestion} maxLength={2000} onChange={(event) => setDraft({ ...draft, suggestion: event.target.value })} />
          </div>
          <div className={styles.annotationEditorField}><label htmlFor="writing-annotation-source">{labels.savingSource}</label>
            <select id="writing-annotation-source" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as Corrector })}>
              {Object.entries(labels.source).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select>
          </div>
          <div className={styles.annotationEditorActions}>
            <button type="button" className={`${ui.primary} ${ui.compact}`} disabled={working} onClick={() => { void submitAnnotation(); }}>{working ? labels.saving : labels.saveAnnotation}</button>
            <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => setEditor('closed')}>{labels.closeAnnotations}</button>
          </div>
        </section>}
        <div ref={textRef} onMouseUp={captureSelection} onKeyUp={captureSelection}
          className={`${styles.text} ${clean ? styles.cleanText : ''}`} data-reading-mode={clean ? 'clean' : 'annotated'}>
          {paragraphs.map((paragraph) => <p key={paragraph.number} data-paragraph={paragraph.number}>
            <span className={styles.paragraphText}>{renderParagraph(paragraph)}</span>
            {visible.some(({ item }) => item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number)
              && <button type="button" className={styles.paragraphButton} aria-label={paragraphLabel(paragraph.number)}
                onClick={() => {
                  const found = visible.find(({ item }) => item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number);
                  if (found !== undefined) choose(found.item.id);
                }}>¶</button>}
            <button type="button" className={styles.addParagraphAnnotation} aria-label={labels.paragraphPrefix ? `${labels.createAnnotation} · ${paragraphLabel(paragraph.number)}` : labels.createAnnotation}
              onClick={() => openCreate('PARAGRAPH', paragraph.number)}>+</button>
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
                <li key={item.id} className={styles.annotationItem}>
                  {index === firstUnplaced && <h3 className={styles.unplacedHeading}>{labels.needsPlacing} ({String(visible.filter(({ item: candidate, anchor: candidateAnchor }) => candidate.scope === 'SPAN' && candidateAnchor === null).length)})</h3>}
                  <button type="button" role="option" aria-selected={selected === item.id}
                    className={`${styles.annotationCard} ${selected === item.id ? styles.annotationSelected : ''}`}
                    onClick={() => choose(item.id)} onFocus={() => setSelected(item.id)}>
                    <span className={styles.annotationCardTop}><strong>{labels.kind[item.kind]}</strong>
                      <span>{item.source === 'IA' ? `${labels.source[item.source]} · ${labels.aiSuggestion}` : labels.source[item.source]}</span></span>
                    {item.focus !== null && <span className={styles.annotationFocus}>{labels.focus[item.focus]}</span>}
                    {item.scope === 'DOCUMENT' && <span className={styles.annotationTarget}>{labels.wholeText}</span>}
                    {item.scope === 'PARAGRAPH' && item.paragraph !== null && <span className={styles.annotationTarget}>{paragraphLabel(item.paragraph)}</span>}
                    {item.scope === 'SPAN' && <span className={styles.annotationTarget}>{anchor?.exact ?? item.quote ?? labels.noAnnotations}</span>}
                    {item.comment !== null && <span>{item.comment}</span>}
                    {item.suggestion !== null && <span className={styles.suggestion}>{item.suggestion}</span>}
                    <span className={styles.reviewStatus}>{item.reviewedAt === null ? labels.unreviewed : labels.reviewed}</span>
                    <span className="sr-only">{String(index + 1)} / {String(visible.length)}</span>
                  </button>
                  {item.scope === 'SPAN' && anchor === null && item.quote !== null && (() => {
                    const matches = quoteMatches(item.quote);
                    return matches.length === 0 ? <p className={styles.reviewStatus}>{labels.noMatches}</p>
                      : <div className={styles.candidateList}>{matches.slice(0, 10).map((candidate, candidateIndex) => (
                        <button key={`${candidate.start}-${candidateIndex}`} type="button" className={ui.textLink}
                          onClick={() => { void placeAnnotation(item.id, candidate.start, candidate.end); }}>
                          {labels.chooseCandidate} · {paragraphLabel(candidate.paragraph)}
                        </button>
                      ))}</div>;
                  })()}
                  <div className={styles.annotationCardActions}>
                    <button type="button" className={ui.textLink} onClick={() => {
                      setSelected(item.id);
                      setDraft({ kind: item.kind, focus: item.focus, source: item.source, comment: item.comment ?? '', suggestion: item.suggestion ?? '' });
                      setEditor('edit');
                    }}>{labels.editAnnotation}</button>
                    {item.reviewedAt === null && <button type="button" className={ui.textLink}
                      onClick={() => { void reviewWritingAnnotationAction(item.id).then((result) => { toast({ message: result.message, tone: result.ok ? 'ok' : 'error' }); if (result.ok) router.refresh(); }); }}>{labels.markStudied}</button>}
                    <button type="button" className={ui.dangerLink} onClick={() => { void removeAnnotation(item); }}>{labels.deleteAnnotation}</button>
                  </div>
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
