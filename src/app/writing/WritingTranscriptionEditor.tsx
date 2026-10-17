'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { updateWritingTextAction } from './annotationActions';
import { useToast } from '../_shared/Toast';
import ui from '../_shared/ui.module.css';
import styles from './writing.module.css';

/**
 * La transcripción se corrige en la propia hoja, con la letra y la medida de la lectura.
 * Sin `controlled` trae su botón (la redacción que aún no tiene texto); con él lo abre el
 * lector desde «Más acciones» y `onDone` lo devuelve a la lectura.
 */
export function WritingTranscriptionEditor({ pieceId, initialText, labels, controlled = false, onDone }: {
  readonly pieceId: number;
  readonly initialText: string;
  readonly controlled?: boolean;
  readonly onDone?: () => void;
  readonly labels: {
    readonly correct: string;
    readonly save: string;
    readonly transcription: string;
    readonly saving: string;
    readonly cancel: string;
    readonly hint?: string;
  };
}) {
  const [open, setOpen] = useState(controlled);
  const [draft, setDraft] = useState(initialText);
  const [working, setWorking] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function close() {
    setOpen(false);
    onDone?.();
  }

  async function save() {
    if (working) return;
    setWorking(true);
    const result = await updateWritingTextAction(pieceId, draft);
    setWorking(false);
    toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
    if (result.ok) { close(); router.refresh(); }
  }

  return (
    <>
      {!controlled && !open && (
        <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={() => { setDraft(initialText); setOpen(true); }}>{labels.correct}</button>
      )}
      {open && <section className={styles.transcriptionEditor} aria-label={labels.correct}>
        <div className={styles.modeBar}>
          <p>{labels.hint ?? labels.correct}</p>
          <div className={styles.modeBarActions}>
            <button type="button" className={`${ui.primary} ${ui.compact}`} disabled={working}
              onClick={() => { void save(); }}>{working ? labels.saving : labels.save}</button>
            <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={close}>{labels.cancel}</button>
          </div>
        </div>
        <label htmlFor={`writing-transcription-${String(pieceId)}`} className="sr-only">{labels.transcription}</label>
        <textarea id={`writing-transcription-${String(pieceId)}`} className={styles.transcriptionText} value={draft} maxLength={20000}
          autoFocus={controlled} spellCheck={false} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
          }} />
      </section>}
    </>
  );
}
