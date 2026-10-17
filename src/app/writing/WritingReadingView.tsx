'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareText, Plus, X } from 'lucide-react';

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
import { useReader } from './ReaderContext';
import { WritingTranscriptionEditor } from './WritingTranscriptionEditor';

import styles from './writing.module.css';
import ui from '../_shared/ui.module.css';
import { useInertBehind, useMediaQuery } from '../_shared/layer';
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
  readonly annotationPanel: string;
  readonly closeAnnotations: string;
  readonly filterType: string;
  readonly kindLabel: string;
  readonly focusLabel: string;
  readonly allKinds: string;
  readonly pendingOnly: string;
  readonly wholeText: string;
  readonly wholeTextNote: string;
  readonly needsPlacing: string;
  readonly paragraphPrefix: string;
  readonly noAnnotations: string;
  readonly noAnnotationsYet: string;
  readonly reviewed: string;
  readonly unreviewed: string;
  readonly showInList: string;
  readonly saving: string;
  readonly newAnnotation: string;
  readonly createAnnotation: string;
  readonly editAnnotation: string;
  readonly deleteAnnotation: string;
  readonly placeHere: string;
  readonly chooseCandidate: string;
  readonly comment: string;
  readonly suggestion: string;
  readonly savingSource: string;
  readonly invalidTarget: string;
  readonly restoreConflict: string;
  readonly noMatches: string;
  readonly aiSuggestion: string;
  readonly markStudied: string;
  readonly saveAnnotation: string;
  readonly annotateText: string;
  readonly annotateHint: string;
  readonly finishAnnotating: string;
  readonly correctTranscription: string;
  readonly transcriptionHint: string;
  readonly saveTranscription: string;
  readonly transcription: string;
  readonly cancel: string;
  readonly kind: Readonly<Record<AnnotationKind, string>>;
  readonly kindPlural: Readonly<Record<AnnotationKind, string>>;
  readonly source: Readonly<Record<Corrector, string>>;
  readonly focus: Readonly<Record<AnnotationFocus, string>>;
};

const KINDS: readonly AnnotationKind[] = ['ERROR', 'IMPROVEMENT', 'STRENGTH', 'COMMENT'];
// Si dos anotaciones pisan el mismo tramo, manda la que más importa leer.
const WEIGHT: Readonly<Record<AnnotationKind, number>> = { ERROR: 0, IMPROVEMENT: 1, COMMENT: 2, STRENGTH: 3 };

interface Selection { readonly start: number; readonly end: number; readonly paragraph: number }
interface Draft { readonly kind: AnnotationKind; readonly focus: AnnotationFocus | null; readonly source: Corrector; readonly comment: string; readonly suggestion: string }
interface Placed { readonly item: Annotation; readonly anchor: StudyAnchor | null }
/** La nota que se enseña junto al texto: la del ratón o el foco, o la que se fijó con un clic. */
interface Note { readonly id: string; readonly target: HTMLElement }
const blankDraft: Draft = { kind: 'ERROR', focus: 'GRAMMAR', source: 'YO', comment: '', suggestion: '' };

function exactAnchor(annotation: Annotation, text: string): StudyAnchor | null {
  const anchor = annotation.anchor;
  return annotation.scope === 'SPAN' && anchor !== null && anchor.start >= 0 && anchor.end <= text.length
    && anchor.end > anchor.start && text.slice(anchor.start, anchor.end) === anchor.exact ? anchor : null;
}

export function WritingReadingView({ pieceId, revision, text, annotations, labels }: {
  readonly pieceId: number;
  readonly revision: number;
  readonly text: string;
  readonly annotations: readonly Annotation[];
  readonly labels: Labels;
}) {
  const { panelOpen, setPanelOpen, mode, setMode } = useReader();
  const [kind, setKind] = useState<AnnotationKind | 'ALL'>('ALL');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Note | null>(null);
  const [pinned, setPinned] = useState<Note | null>(null);
  const [touched, setTouched] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<'closed' | 'create' | 'edit'>('closed');
  const [scope, setScope] = useState<AnnotationScope>('SPAN');
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [working, setWorking] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const router = useRouter();
  const toast = useToast();
  const annotating = mode === 'annotate';
  // Bajo 1024 px el panel es un cajón sobre el texto: lo de detrás no se alcanza mientras está abierto.
  const narrow = useMediaQuery('(max-width: 1023px)');
  useInertBehind(panelRef, panelOpen && narrow);
  const paragraphs = useMemo(() => paragraphsOf(text), [text]);
  const paragraphLabel = (number: number) => `${labels.paragraphPrefix}${String(number)}`;

  // En el orden en que se lee: lo que va sobre todo el texto, luego párrafo a párrafo, y al final lo que no encontró su sitio.
  const placed = useMemo<readonly Placed[]>(() => {
    const paragraphOf = (start: number) => paragraphs.find((paragraph) => start >= paragraph.start && start < paragraph.end)?.number ?? 0;
    const order = ({ item, anchor }: Placed): readonly number[] => item.scope === 'DOCUMENT' ? [0, 0, 0]
      : item.scope === 'PARAGRAPH' ? [1, item.paragraph ?? 0, -1]
        : anchor === null ? [2, 0, 0] : [1, paragraphOf(anchor.start), anchor.start];
    return annotations.map((item) => ({ item, anchor: exactAnchor(item, text) }))
      .sort((a, b) => {
        const [x, y] = [order(a), order(b)];
        return (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0) || (x[2] ?? 0) - (y[2] ?? 0);
      });
  }, [annotations, paragraphs, text]);
  const visible = placed.filter(({ item }) => (kind === 'ALL' || item.kind === kind) && (!pendingOnly || item.reviewedAt === null));
  const byId = useMemo(() => new Map(placed.map((entry) => [entry.item.id, entry])), [placed]);
  const selectedAnnotation = selected === null ? null : byId.get(selected)?.item ?? null;
  const unplaced = visible.filter(({ item, anchor }) => item.scope === 'SPAN' && anchor === null);
  const note = pinned ?? hovered;
  const noteEntry = note === null ? undefined : byId.get(note.id);

  const quietFocus = useRef(false);
  const markFor = useCallback((item: Annotation) => textRef.current?.querySelector<HTMLElement>(item.scope === 'PARAGRAPH'
    ? `[data-paragraph="${String(item.paragraph ?? 0)}"]` : `[data-annotation-ids~="${CSS.escape(item.id)}"]`) ?? null, []);

  // Escape cierra primero lo que esté más arriba: la nota fijada, la nota de paso y, después, el panel.
  useEffect(() => {
    if (!panelOpen && pinned === null && hovered === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (pinned !== null) { event.preventDefault(); unpin(); }
      else if (hovered !== null) { event.preventDefault(); window.clearTimeout(hoverTimer.current); setHovered(null); }
      else setPanelOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  });

  // Como cajón (pantallas estrechas), el foco entra al abrirlo y, si se cierra con el foco
  // dentro, vuelve al botón que lo abre: el panel cerrado es inerte y el foco se perdería.
  const wasOpen = useRef(panelOpen);
  useEffect(() => {
    const closing = wasOpen.current && !panelOpen;
    wasOpen.current = panelOpen;
    if (!narrow) return;
    if (panelOpen) { panelRef.current?.focus(); return; }
    if (!closing) return;
    const active = document.activeElement;
    if (active === document.body || (active !== null && panelRef.current?.contains(active) === true)) {
      document.querySelector<HTMLElement>('[aria-controls="writing-annotations"]')?.focus();
    }
  }, [panelOpen, narrow]);

  // Un clic fuera de la nota fijada la suelta.
  useEffect(() => {
    if (pinned === null) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popRef.current?.contains(target) || pinned.target.contains(target)) return;
      setPinned(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);

  // La nota se coloca bajo la primera línea del tramo; si no cabe debajo, encima.
  useLayoutEffect(() => {
    const pop = popRef.current;
    const box = textRef.current;
    if (note === null || pop === null || box === null) return;
    const place = () => {
      const lines = note.target.getClientRects();
      const first = lines[0];
      if (first === undefined) return;
      const frame = box.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      const left = Math.min(Math.max(first.left - frame.left - 12, 0), Math.max(frame.width - width, 0));
      const below = first.bottom + 10 + height <= window.innerHeight - 8 || first.top - height - 10 < 64;
      pop.style.setProperty('--note-x', `${String(Math.round(left))}px`);
      pop.style.setProperty('--note-y', `${String(Math.round(below ? first.bottom - frame.top + 8 : first.top - frame.top - height - 8))}px`);
      pop.dataset['side'] = below ? 'below' : 'above';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [note, panelOpen]);

  function choose(item: Annotation, scroll: boolean) {
    setSelected(item.id);
    setPinned(null);
    if (!scroll) return;
    const target = markFor(item);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    if (narrow) {
      setPanelOpen(false);
      // El foco va al tramo elegido, que es lo que se quería ver.
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
  }

  function move(delta: number) {
    if (visible.length === 0) return;
    const index = visible.findIndex(({ item }) => item.id === selected);
    const next = visible[(index + delta + visible.length) % visible.length];
    if (next !== undefined) {
      choose(next.item, false);
      panelRef.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(next.item.id)}"]`)?.focus();
    }
  }

  function hover(id: string | null, target?: HTMLElement) {
    window.clearTimeout(hoverTimer.current);
    if (id === null || target === undefined) { hoverTimer.current = window.setTimeout(() => setHovered(null), 90); return; }
    hoverTimer.current = window.setTimeout(() => setHovered({ id, target }), 110);
  }

  function pin(id: string, target: HTMLElement, fromKeyboard = false) {
    window.clearTimeout(hoverTimer.current);
    setHovered(null);
    if (pinned?.id === id) { setPinned(null); return; }
    setPinned({ id, target });
    setSelected(id);
    // Con teclado, el foco entra en la nota para llegar a sus acciones.
    if (fromKeyboard) window.requestAnimationFrame(() => popRef.current?.focus());
  }

  function unpin() {
    const target = pinned?.target;
    setPinned(null);
    quietFocus.current = true;
    target?.focus();
  }

  function showInList(id: string) {
    setPinned(null);
    setKind('ALL');
    setPendingOnly(false);
    setSelected(id);
    setPanelOpen(true);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(id)}"]`)?.focus({ preventScroll: false }), 60);
  }

  function captureSelection() {
    if (!annotating) return;
    const selectedText = window.getSelection();
    if (selectedText === null || selectedText.isCollapsed || selectedText.rangeCount === 0) { setSelection(null); return; }
    const range = selectedText.getRangeAt(0);
    const startParagraph = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-paragraph]');
    const endParagraph = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest<HTMLElement>('[data-paragraph]');
    if (startParagraph === null || startParagraph === undefined || startParagraph !== endParagraph) { setSelection(null); return; }
    const number = Number(startParagraph.dataset['paragraph']);
    const metadata = paragraphs.find((item) => item.number === number);
    const textElement = startParagraph.querySelector('[data-paragraph-text]');
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
    setPanelOpen(true);
    if (nextScope !== 'SPAN') setSelection(nextScope === 'PARAGRAPH' && paragraph !== undefined
      ? { start: 0, end: 0, paragraph } : null);
  }

  function openEdit(item: Annotation) {
    setPinned(null);
    setSelected(item.id);
    setDraft({ kind: item.kind, focus: item.focus, source: item.source, comment: item.comment ?? '', suggestion: item.suggestion ?? '' });
    setEditor('edit');
    setPanelOpen(true);
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

  async function markStudied(id: string) {
    const result = await reviewWritingAnnotationAction(id);
    toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
    if (result.ok) router.refresh();
  }

  async function removeAnnotation(annotation: Annotation) {
    const result = await deleteWritingAnnotationAction(annotation.id);
    if (!result.ok) { toast({ message: result.message, tone: 'error' }); return; }
    setSelected(null);
    setPinned(null);
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
    if (result.ok) { setSelected(id); setSelection(null); router.refresh(); }
  }

  function quoteMatches(quote: string): readonly Selection[] {
    return paragraphs.flatMap((paragraph) => {
      const indexes: Selection[] = [];
      let at = text.indexOf(quote, paragraph.start);
      while (at !== -1 && at < paragraph.end) {
        if (at + quote.length <= paragraph.end) indexes.push({ start: at, end: at + quote.length, paragraph: paragraph.number });
        at = text.indexOf(quote, at + 1);
      }
      return indexes;
    });
  }

  function markEvents(id: string) {
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse') hover(id, event.currentTarget); },
      onPointerLeave: (event: React.PointerEvent<HTMLElement>) => { if (event.pointerType === 'mouse') hover(null); },
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        // Al volver de una nota cerrada con Escape, el foco regresa sin reabrirla.
        if (quietFocus.current) { quietFocus.current = false; return; }
        if (pinned === null && event.currentTarget.matches(':focus-visible')) { window.clearTimeout(hoverTimer.current); setHovered({ id, target: event.currentTarget }); }
      },
      onBlur: () => { window.clearTimeout(hoverTimer.current); setHovered(null); },
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        // Seleccionar texto para anotarlo no debe abrir la nota del tramo.
        if (annotating && !(window.getSelection()?.isCollapsed ?? true)) return;
        pin(id, event.currentTarget);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(id, event.currentTarget, true); }
      },
    };
  }

  function renderParagraph(paragraph: (typeof paragraphs)[number]) {
    const related = visible.flatMap(({ item, anchor }) => anchor !== null && anchor.start < paragraph.end && anchor.end > paragraph.start
      ? [{ item, start: Math.max(anchor.start, paragraph.start), end: Math.min(anchor.end, paragraph.end) }] : []);
    const points = [...new Set([paragraph.start, paragraph.end, ...related.flatMap((item) => [item.start, item.end])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((start) => {
      const end = points[points.indexOf(start) + 1] ?? paragraph.end;
      const covering = related.filter((item) => item.start < end && item.end > start)
        .sort((a, b) => WEIGHT[a.item.kind] - WEIGHT[b.item.kind]);
      const ids = covering.map((item) => item.item.id);
      const primary = covering[0]?.item;
      const piece = text.slice(start, end);
      if (primary === undefined) return <span key={`${String(paragraph.number)}-${String(start)}`}>{piece}</span>;
      const showing = note?.id === primary.id;
      return <mark key={`${String(paragraph.number)}-${String(start)}`} className={styles.mark} data-kind={primary.kind}
        data-annotation-ids={ids.join(' ')} data-selected={ids.includes(selected ?? '') ? 'true' : undefined}
        data-reviewed={primary.reviewedAt === null ? undefined : 'true'}
        role="button" tabIndex={0} aria-expanded={pinned?.id === primary.id}
        aria-describedby={showing ? 'writing-note' : undefined}
        aria-label={`${piece} · ${labels.kind[primary.kind]}${primary.focus === null ? '' : ` · ${labels.focus[primary.focus]}`}`}
        {...markEvents(primary.id)}>{piece}</mark>;
    });
  }

  const counts = KINDS.map((entry) => [entry, placed.filter(({ item }) => item.kind === entry).length] as const).filter(([, count]) => count > 0);
  const editorTarget = editor === 'edit' && selectedAnnotation !== null ? targetLabel(selectedAnnotation, byId.get(selectedAnnotation.id)?.anchor ?? null)
    : scope === 'DOCUMENT' ? labels.wholeText
      : scope === 'PARAGRAPH' && selection !== null ? paragraphLabel(selection.paragraph)
        : selection === null ? null : text.slice(selection.start, selection.end);

  function targetLabel(item: Annotation, anchor: StudyAnchor | null): string {
    return item.scope === 'DOCUMENT' ? labels.wholeText
      : item.scope === 'PARAGRAPH' && item.paragraph !== null ? paragraphLabel(item.paragraph)
        : anchor?.exact ?? item.quote ?? '';
  }

  /**
   * Lo que dice una anotación. En el texto el tramo ya está a la vista y solo se repite si
   * lleva corrección («tu texto → corrección»); en la lista, el tramo encabeza la fila.
   */
  function noteBody({ item, anchor }: Placed, inList: boolean) {
    const target = targetLabel(item, anchor);
    const pair = item.suggestion !== null && item.scope === 'SPAN' && target !== '' && (item.kind === 'ERROR' || item.kind === 'IMPROVEMENT');
    return (
      <>
        {pair ? <span className={styles.notePair}><s>{target}</s><span className={styles.noteArrow} aria-hidden="true">→</span><strong>{item.suggestion}</strong></span>
          : <>
            {(inList || item.scope !== 'SPAN') && <span className={styles.noteTarget} data-kind={item.kind} data-scope={item.scope}>{target}</span>}
            {item.suggestion !== null && <span className={styles.notePair}><strong>{item.suggestion}</strong></span>}
          </>}
        {item.comment !== null && <span className={styles.noteComment}>{item.comment}</span>}
        <span className={styles.noteMeta}>
          <span className={styles.kindDot} data-kind={item.kind} aria-hidden="true" />
          {labels.kind[item.kind]}{item.focus === null ? '' : ` · ${labels.focus[item.focus]}`}
          {item.source === 'IA' ? ` · ${labels.aiSuggestion}` : ''}
          {item.reviewedAt !== null && ` · ${labels.reviewed}`}
        </span>
      </>
    );
  }

  if (mode === 'transcribe') {
    return (
      <WritingTranscriptionEditor pieceId={pieceId} revision={revision} initialText={text} controlled onDone={() => setMode('read')} labels={{
        correct: labels.correctTranscription, save: labels.saveTranscription, transcription: labels.transcription,
        saving: labels.saving, cancel: labels.cancel, hint: labels.transcriptionHint,
      }} />
    );
  }

  return (
    <div className={styles.readingLayout} data-panel={panelOpen ? 'open' : 'closed'}>
      <section className={styles.readingMain} aria-label={labels.transcription}>
        {annotating && (
          <div className={styles.modeBar} role="region" aria-label={labels.annotateText}>
            {/* Con un fragmento elegido, la barra lo enseña en lugar de la ayuda y no cambia de alto. */}
            {selection !== null && scope === 'SPAN' && editor === 'closed'
              ? <p className={styles.modeSelection}>{text.slice(selection.start, selection.end)}</p>
              : <p>{labels.annotateHint}</p>}
            <div className={styles.modeBarActions}>
              {selection !== null && scope === 'SPAN' && editor === 'closed' && (
                <button type="button" className={`${ui.primary} ${ui.compact}`} onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (selectedAnnotation?.scope === 'SPAN' && byId.get(selectedAnnotation.id)?.anchor === null) {
                      void placeAnnotation(selectedAnnotation.id, selection.start, selection.end);
                    } else openCreate('SPAN');
                  }}>
                  {selectedAnnotation?.scope === 'SPAN' && byId.get(selectedAnnotation.id)?.anchor === null ? labels.placeHere : labels.createAnnotation}
                </button>
              )}
              <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => openCreate('DOCUMENT')}>{labels.wholeTextNote}</button>
              <button type="button" className={`${ui.secondary} ${ui.compact}`}
                onClick={() => { setMode('read'); setEditor('closed'); setSelection(null); }}>{labels.finishAnnotating}</button>
            </div>
          </div>
        )}
        <div ref={textRef} className={styles.text} data-reading-mode={annotating ? 'annotate' : 'read'}
          onMouseUp={captureSelection} onKeyUp={captureSelection}>
          {paragraphs.map((paragraph) => {
            const notes = visible.filter(({ item }) => item.scope === 'PARAGRAPH' && item.paragraph === paragraph.number);
            const lead = [...notes].sort((a, b) => WEIGHT[a.item.kind] - WEIGHT[b.item.kind])[0]?.item;
            return (
              <p key={paragraph.number} data-paragraph={paragraph.number} data-revealed={touched === paragraph.number ? 'true' : undefined}
                onPointerDown={(event) => { if (event.pointerType !== 'mouse') setTouched(paragraph.number); }}>
                {lead !== undefined && (
                  <button type="button" className={styles.paragraphNote} data-kind={lead.kind} data-paragraph-note={lead.id}
                    data-selected={notes.some(({ item }) => item.id === selected) ? 'true' : undefined}
                    aria-expanded={pinned?.id === lead.id} aria-describedby={note?.id === lead.id ? 'writing-note' : undefined}
                    aria-label={`${labels.kind[lead.kind]} · ${paragraphLabel(paragraph.number)}`} {...markEvents(lead.id)}>
                    <MessageSquareText size={14} aria-hidden="true" />
                    {notes.length > 1 && <span className={styles.paragraphNoteCount}>{notes.length}</span>}
                  </button>
                )}
                <span data-paragraph-text>{renderParagraph(paragraph)}</span>
                {annotating && (
                  <button type="button" className={styles.addParagraphNote}
                    aria-label={`${labels.newAnnotation} · ${paragraphLabel(paragraph.number)}`}
                    onClick={() => openCreate('PARAGRAPH', paragraph.number)}>
                    <Plus size={14} aria-hidden="true" />
                  </button>
                )}
              </p>
            );
          })}
          {note !== null && noteEntry !== undefined && (
            <div ref={popRef} id="writing-note" className={styles.note} data-kind={noteEntry.item.kind} data-pinned={pinned === null ? undefined : 'true'}
              // Se puede llevar el ratón a la nota sin que desaparezca (WCAG 1.4.13).
              onPointerEnter={(event) => { if (event.pointerType === 'mouse' && pinned === null) window.clearTimeout(hoverTimer.current); }}
              onPointerLeave={(event) => { if (event.pointerType === 'mouse' && pinned === null) hover(null); }}
              role={pinned === null ? 'tooltip' : 'dialog'} aria-label={pinned === null ? undefined : labels.kind[noteEntry.item.kind]}
              tabIndex={pinned === null ? undefined : -1}
              onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); unpin(); } }}>
              {noteBody(noteEntry, false)}
              {pinned !== null && (
                <div className={styles.noteActions}>
                  {noteEntry.item.reviewedAt === null && (
                    <button type="button" className={ui.textLink} onClick={() => { void markStudied(noteEntry.item.id); }}>{labels.markStudied}</button>
                  )}
                  <button type="button" className={ui.textLink} onClick={() => showInList(noteEntry.item.id)}>{labels.showInList}</button>
                  {annotating && <button type="button" className={ui.textLink} onClick={() => openEdit(noteEntry.item)}>{labels.editAnnotation}</button>}
                  <button type="button" className={`${ui.iconButton} ${styles.noteClose}`} aria-label={labels.closeAnnotations} onClick={unpin}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside id="writing-annotations" ref={panelRef} tabIndex={-1} className={styles.annotationPanel}
        aria-label={labels.annotationPanel} inert={!panelOpen}
        onKeyDown={(event) => {
          // Las flechas (y j/k) recorren la lista desde cualquier punto del panel salvo en el formulario.
          if (!(event.target instanceof HTMLElement) || event.target.closest('form, input, select, textarea') !== null) return;
          if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') { event.preventDefault(); move(1); }
          else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') { event.preventDefault(); move(-1); }
        }}>
        <header className={styles.annotationHead}>
          <h2>{labels.annotationPanel}</h2>
          <div className={styles.annotationHeadActions}>
            {annotations.length > 0 && editor === 'closed' && (
              <button type="button" className={`${ui.pill} ${styles.pendingPill}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}>
                {labels.pendingOnly}
              </button>
            )}
            <button type="button" className={ui.iconButton} aria-label={labels.closeAnnotations} onClick={() => setPanelOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {editor !== 'closed' ? (
          <form className={styles.annotationEditor} aria-label={editor === 'edit' ? labels.editAnnotation : labels.newAnnotation}
            onSubmit={(event) => { event.preventDefault(); void submitAnnotation(); }}>
            <h3>{editor === 'edit' ? labels.editAnnotation : labels.newAnnotation}</h3>
            {editorTarget !== null && <p className={styles.editorTarget}>{editorTarget}</p>}
            <div className={styles.editorRow}>
              <div className={ui.field}><label htmlFor="writing-annotation-form-kind">{labels.kindLabel}</label>
                <select id="writing-annotation-form-kind" className={ui.select} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as AnnotationKind })}>
                  {KINDS.map((entry) => <option key={entry} value={entry}>{labels.kind[entry]}</option>)}
                </select>
              </div>
              <div className={ui.field}><label htmlFor="writing-annotation-form-focus">{labels.focusLabel}</label>
                <select id="writing-annotation-form-focus" className={ui.select} value={draft.focus ?? ''} onChange={(event) => setDraft({ ...draft, focus: event.target.value === '' ? null : event.target.value as AnnotationFocus })}>
                  <option value="">—</option>
                  {Object.entries(labels.focus).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                </select>
              </div>
            </div>
            <div className={ui.field}><label htmlFor="writing-annotation-suggestion">{labels.suggestion}</label>
              <textarea id="writing-annotation-suggestion" className={ui.textarea} rows={2} value={draft.suggestion} maxLength={2000} onChange={(event) => setDraft({ ...draft, suggestion: event.target.value })} />
            </div>
            <div className={ui.field}><label htmlFor="writing-annotation-comment">{labels.comment}</label>
              <textarea id="writing-annotation-comment" className={ui.textarea} rows={3} value={draft.comment} maxLength={2000} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} />
            </div>
            <div className={ui.field}><label htmlFor="writing-annotation-source">{labels.savingSource}</label>
              <select id="writing-annotation-source" className={ui.select} value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as Corrector })}>
                {Object.entries(labels.source).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </div>
            <div className={styles.editorActions}>
              <button type="submit" className={`${ui.primary} ${ui.compact}`} disabled={working}>{working ? labels.saving : labels.saveAnnotation}</button>
              <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => setEditor('closed')}>{labels.cancel}</button>
            </div>
          </form>
        ) : (
          <>
            {annotations.length > 0 && (
              <div className={styles.annotationFilters} role="group" aria-label={labels.filterType}>
                <button type="button" className={ui.pill} aria-pressed={kind === 'ALL'} onClick={() => setKind('ALL')}>
                  {labels.allKinds}<span className={styles.pillCount}>{annotations.length}</span>
                </button>
                {counts.map(([entry, count]) => (
                  <button key={entry} type="button" className={ui.pill} aria-pressed={kind === entry} onClick={() => setKind(kind === entry ? 'ALL' : entry)}>
                    {labels.kindPlural[entry]}<span className={styles.pillCount}>{count}</span>
                  </button>
                ))}
              </div>
            )}
            {annotations.length === 0 ? <p className={ui.help}>{labels.noAnnotationsYet}</p>
              : visible.length === 0 ? <p className={ui.help}>{labels.noAnnotations}</p>
                // Una lista de botones, no un listbox: cada fila lleva debajo sus acciones.
                : <ul className={styles.annotationList} aria-label={labels.annotationPanel}>
                  {visible.map((entry, index) => {
                    const { item, anchor } = entry;
                    const active = selected === item.id;
                    const lost = item.scope === 'SPAN' && anchor === null;
                    return (
                      <li key={item.id} className={styles.annotationItem} data-selected={active ? 'true' : undefined}>
                        {lost && unplaced[0]?.item.id === item.id && <h3 className={styles.unplacedHeading}>{labels.needsPlacing} ({String(unplaced.length)})</h3>}
                        <button type="button" aria-current={active ? 'true' : undefined} data-option={item.id}
                          className={styles.annotationRow} onClick={() => choose(item, !lost)}>
                          {noteBody(entry, true)}
                          <span className="sr-only">{String(index + 1)} / {String(visible.length)} · {item.reviewedAt === null ? labels.unreviewed : labels.reviewed}</span>
                        </button>
                        {active && lost && item.quote !== null && annotating && (() => {
                          const matches = quoteMatches(item.quote);
                          return matches.length === 0 ? <p className={ui.help}>{labels.noMatches}</p>
                            : <div className={styles.candidateList}>{matches.slice(0, 10).map((candidate, candidateIndex) => (
                              <button key={`${String(candidate.start)}-${String(candidateIndex)}`} type="button" className={ui.textLink}
                                onClick={() => { void placeAnnotation(item.id, candidate.start, candidate.end); }}>
                                {labels.chooseCandidate} · {paragraphLabel(candidate.paragraph)}
                              </button>
                            ))}</div>;
                        })()}
                        {active && (
                          <div className={styles.rowActions}>
                            {item.reviewedAt === null && <button type="button" className={ui.textLink} onClick={() => { void markStudied(item.id); }}>{labels.markStudied}</button>}
                            {annotating && <button type="button" className={ui.textLink} onClick={() => openEdit(item)}>{labels.editAnnotation}</button>}
                            {annotating && <button type="button" className={ui.dangerLink} onClick={() => { void removeAnnotation(item); }}>{labels.deleteAnnotation}</button>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>}
          </>
        )}
      </aside>
      {panelOpen && <button type="button" className={styles.annotationScrim} aria-label={labels.closeAnnotations} tabIndex={-1} data-layer-part
        onClick={() => setPanelOpen(false)} />}
    </div>
  );
}
