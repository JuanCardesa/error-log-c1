'use client';

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyStudyCommand, isStudyHighlighted, studyAnchor, studySegments,
  type NotebookAnnotation, type StudyColor, type StudyCommand } from '@/lib/notebook/annotations';
import { saveStudyAnnotationAction } from './actions';
import { readStudySelection, type StudySelection } from './studySelection';
import { StudyMarksContext } from './StudyText';
import styles from './study.module.css';

const colors: ReadonlyArray<{ value: StudyColor | null; label: string }> = [
  { value: null, label: 'Normal' }, { value: 'green', label: 'Verde' }, { value: 'red', label: 'Rojo' },
  { value: 'blue', label: 'Azul' }, { value: 'orange', label: 'Naranja' },
];

export function NotebookStudy({ noteId, uid, revision, text, children, initialAnnotations }: {
  readonly noteId: number; readonly uid: string; readonly revision: number;
  readonly text: string; readonly children: ReactNode; readonly initialAnnotations: readonly NotebookAnnotation[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [selection, setSelection] = useState<StudySelection | null>(null);
  const [palette, setPalette] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const segments = useMemo(() => studySegments(annotations), [annotations]);
  // El servidor entrega el Markdown ya renderizado. Solo sus StudyText consumen las marcas.
  const orphaned = annotations.filter((item) => item.orphaned).length;
  const highlighted = selection !== null && isStudyHighlighted(annotations, selection);

  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const leaves = [...element.querySelectorAll<HTMLElement>('[data-study-start]')];
    const close = () => { setSelection(null); setPalette(false); };
    const capture = (event: Event) => {
      if (busy.current || toolbar.current?.contains(event.target as Node) || toolbar.current?.contains(document.activeElement)) return;
      setPalette(false);
      setSelection(readStudySelection(element, leaves, text));
    };
    const down = (event: PointerEvent) => {
      if (toolbar.current?.contains(event.target as Node)) return;
      close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const focused = toolbar.current?.contains(document.activeElement);
        close();
        if (focused) element.focus({ preventScroll: true });
      } else if (event.key === 'Tab' && !toolbar.current?.contains(document.activeElement)
        && window.getSelection()?.isCollapsed === false && toolbar.current !== null) {
        event.preventDefault();
        toolbar.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') capture(event);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', capture);
    document.addEventListener('keyup', keyUp);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', capture);
      document.removeEventListener('keyup', keyUp);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [text]);

  function apply(command: StudyCommand) {
    if (selection === null || busy.current) return;
    busy.current = true;
    const before = annotations;
    const anchor = studyAnchor(text, selection.start, selection.end);
    setAnnotations(applyStudyCommand(before, text, anchor, command, noteId, new Date().toISOString(), () => crypto.randomUUID()));
    setSaving(true);
    setError('');
    setMessage('Guardando marcas…');
    setPalette(false);
    window.getSelection()?.removeAllRanges();
    startTransition(async () => {
      try {
        const result = await saveStudyAnnotationAction({ noteId, uid, expectedRevision: revision, anchor, command });
        if (!result.ok) {
          setAnnotations(before);
          setMessage('');
          setError(result.message);
          return;
        }
        setAnnotations(result.data);
        setMessage('Marcas guardadas');
      } catch {
        setAnnotations(before);
        setMessage('');
        setError('No se pudo guardar. Comprueba la conexión e inténtalo de nuevo.');
      } finally {
        busy.current = false;
        setSaving(false);
      }
    });
  }

  return (
    <>
      {orphaned > 0 && <p className={styles.notice} role="status">{orphaned} {orphaned === 1 ? 'marca no se ha podido recolocar' : 'marcas no se han podido recolocar'} tras editar. Se conservan guardadas.</p>}
      {error && <p className={styles.error} role="alert">{error} El cambio de formato se ha revertido.</p>}
      <div className={styles.saveStatus} role="status" aria-live="polite">{message}</div>
      <StudyMarksContext value={segments}>
        <div ref={root} data-study-content tabIndex={-1}>{children}</div>
      </StudyMarksContext>
      {selection !== null && <div ref={toolbar} className={styles.toolbar} role="group" aria-label="Marcar texto"
        style={{ left: selection.left, top: Math.max(12, Math.min(selection.top, selection.viewportHeight - (palette ? 148 : 54))) }}
        onPointerDown={(event) => { if (event.pointerType === 'mouse') event.preventDefault(); }}>
        <div className={styles.tools}>
          <button type="button" disabled={saving} aria-pressed={highlighted}
            onClick={() => { apply({ kind: 'highlight', enabled: !highlighted }); }}>Rotulador</button>
          <button type="button" disabled={saving} aria-expanded={palette} aria-controls={`study-colors-${String(noteId)}`}
            onClick={() => { setPalette(!palette); }}>Color</button>
          <button type="button" disabled={saving} onClick={() => { apply({ kind: 'clear' }); }}>Limpiar</button>
        </div>
        {palette && <div id={`study-colors-${String(noteId)}`} className={styles.palette} role="group" aria-label="Color del texto">
          {colors.map(({ value, label }) => <button key={label} type="button" onClick={() => { apply({ kind: 'color', color: value }); }}>
            <span className={styles.swatch} data-study-color={value ?? undefined} aria-hidden="true">A</span>{label}
          </button>)}
        </div>}
      </div>}
    </>
  );
}
