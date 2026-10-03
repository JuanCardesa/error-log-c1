'use client';

import Link from 'next/link';
import { useState } from 'react';

import { notebookNoteHref } from '@/lib/notebook/urls';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import ui from '../_shared/ui.module.css';
import { downloadNotebookDraft, notebookDraftKey, type NotebookDraft } from './notebookDraft';
import { discardNotebookDraft, useNotebookDrafts } from './useNotebookDraft';
import styles from './notebook.module.css';

function draftHref(draft: NotebookDraft): string {
  const base = draft.noteId === null ? '/notebook/nuevo'
    : `${notebookNoteHref({ id: draft.noteId, title: draft.title })}/editar`;
  return `${base}?borrador=${encodeURIComponent(notebookDraftKey(draft))}`;
}

export function NotebookDraftNotice() {
  const drafts = useNotebookDrafts();
  const [discarding, setDiscarding] = useState<NotebookDraft | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  if (drafts.length === 0) return null;

  return (
    <section className={styles.draftNotice} aria-labelledby="notebook-drafts-title">
      <h2 id="notebook-drafts-title">Borradores locales pendientes ({drafts.length})</h2>
      <p>Hay cambios guardados en este navegador que todavía puedes recuperar.</p>
      <ul className={styles.draftList}>
        {drafts.map((draft) => <li key={notebookDraftKey(draft)}>
          <div>
            <strong>{draft.title.trim() || 'Apunte sin título'}</strong>
            <span> · {draft.noteId === null ? 'Nuevo apunte' : `Apunte ${String(draft.noteId)}`}
              {' · '}{new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.savedAt))}</span>
          </div>
          <div className={styles.draftActions}>
            <Link href={draftHref(draft)}>Abrir borrador</Link>
            <button type="button" className={ui.textLink} onClick={() => { downloadNotebookDraft(draft); }}>Descargar</button>
            <button type="button" className={ui.dangerLink} onClick={() => { setDiscardError(null); setDiscarding(draft); }}>Descartar…</button>
          </div>
        </li>)}
      </ul>
      <ConfirmDialog open={discarding !== null} title="Descartar borrador local" confirmLabel="Descartar borrador"
        error={discardError}
        onConfirm={() => {
          if (discarding === null) return;
          if (discardNotebookDraft(discarding)) setDiscarding(null);
          else setDiscardError('No se pudo borrar la copia local. Inténtalo de nuevo.');
        }}
        onCancel={() => { setDiscarding(null); setDiscardError(null); }}>
        Se borrará la copia local de «{discarding?.title.trim() || 'Apunte sin título'}». Esta acción no se puede deshacer.
      </ConfirmDialog>
    </section>
  );
}
