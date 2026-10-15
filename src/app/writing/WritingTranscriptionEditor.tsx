'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { updateWritingTextAction } from './annotationActions';
import { useToast } from '../_shared/Toast';
import ui from '../_shared/ui.module.css';
import styles from './writing.module.css';

export function WritingTranscriptionEditor({ pieceId, initialText, labels }: {
  readonly pieceId: number;
  readonly initialText: string;
  readonly labels: {
    readonly correct: string;
    readonly save: string;
    readonly transcription: string;
    readonly saving: string;
    readonly cancel: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialText);
  const [working, setWorking] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save() {
    if (working) return;
    setWorking(true);
    const result = await updateWritingTextAction(pieceId, draft);
    setWorking(false);
    toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
    if (result.ok) { setOpen(false); router.refresh(); }
  }

  return (
    <>
      <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => { setDraft(initialText); setOpen(true); }}>{labels.correct}</button>
      {open && <section className={styles.transcriptionEditor} aria-label={labels.correct}>
        <label htmlFor={`writing-transcription-${String(pieceId)}`}>{labels.transcription}</label>
        <textarea id={`writing-transcription-${String(pieceId)}`} value={draft} maxLength={20000}
          onChange={(event) => setDraft(event.target.value)} />
        <div className={styles.annotationEditorActions}>
          <button type="button" className={`${ui.primary} ${ui.compact}`} disabled={working}
            onClick={() => { void save(); }}>{working ? labels.saving : labels.save}</button>
          <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => setOpen(false)}>{labels.cancel}</button>
        </div>
      </section>}
    </>
  );
}
