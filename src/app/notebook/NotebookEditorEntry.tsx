'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { NotebookFolder, NotebookNote } from '@/lib/notebook/types';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { getNoteAction } from './actions';
import { NotebookEditor } from './NotebookEditor';

/** History navigation can restore old RSC props. Read the current revision before editing. */
export function NotebookEditorEntry({ id, uid, folders, requestedDraftKey }: {
  readonly id: number;
  readonly uid: string;
  readonly folders: readonly NotebookFolder[];
  readonly requestedDraftKey?: string;
}) {
  const t = useT();
  const [note, setNote] = useState<NotebookNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void getNoteAction({ id, uid }).then((result) => {
      if (!active) return;
      if (result.ok) setNote(result.data);
      else setError(result.message);
    }).catch(() => {
      if (active) setError(t.notebook.loadCurrentFailed);
    });
    return () => { active = false; };
  }, [id, uid, attempt, t]);

  if (note !== null) return <NotebookEditor note={note} folders={folders} requestedDraftKey={requestedDraftKey} />;
  return <div>
    <h1>{t.notebook.editNote}</h1>
    {error === null ? <p role="status">{t.notebook.loadingCurrent}</p> : <>
      <p role="alert">{error}</p>
      <button type="button" className={ui.secondary} onClick={() => { setError(null); setAttempt(attempt + 1); }}>{t.common.retry}</button>
    </>}
    <Link href="/notebook" className={ui.backLink}>{t.notebook.backToNotebook}</Link>
  </div>;
}
