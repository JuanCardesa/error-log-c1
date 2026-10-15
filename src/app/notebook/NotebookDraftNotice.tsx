'use client';

import Link from 'next/link';
import { useState } from 'react';

import { notebookNoteHref } from '@/lib/notebook/urls';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { useT } from '../_shared/i18nClient';
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
  const t = useT();
  const n = t.notebook;
  const drafts = useNotebookDrafts();
  const [discarding, setDiscarding] = useState<NotebookDraft | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  if (drafts.length === 0) return null;

  return (
    <section className={styles.draftNotice} aria-labelledby="notebook-drafts-title">
      <h2 id="notebook-drafts-title">{n.draftsTitle(drafts.length)}</h2>
      <p>{n.draftsBody}</p>
      <ul className={styles.draftList}>
        {drafts.map((draft) => <li key={notebookDraftKey(draft)}>
          <div>
            <strong>{draft.title.trim() || n.untitledNote}</strong>
            <span> · {draft.noteId === null ? n.newNote : n.noteNumber(draft.noteId)}
              {' · '}{new Intl.DateTimeFormat(t.format.intl, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.savedAt))}</span>
          </div>
          <div className={styles.draftActions}>
            <Link href={draftHref(draft)}>{n.openDraft}</Link>
            <button type="button" className={ui.textLink} onClick={() => { downloadNotebookDraft(draft); }}>{t.common.download}</button>
            <button type="button" className={ui.dangerLink} onClick={() => { setDiscardError(null); setDiscarding(draft); }}>{n.discardMenu}</button>
          </div>
        </li>)}
      </ul>
      <ConfirmDialog open={discarding !== null} title={n.discardDraftTitle} confirmLabel={n.discardDraft}
        error={discardError}
        onConfirm={() => {
          if (discarding === null) return;
          if (discardNotebookDraft(discarding)) setDiscarding(null);
          else setDiscardError(n.discardFailed);
        }}
        onCancel={() => { setDiscarding(null); setDiscardError(null); }}>
        {n.discardDraftBody(discarding?.title.trim() || n.untitledNote)}
      </ConfirmDialog>
    </section>
  );
}
