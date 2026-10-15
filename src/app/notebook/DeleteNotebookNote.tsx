'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { NotebookNote } from '@/lib/notebook/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { deleteNoteAction } from './actions';

export function DeleteNotebookNote({ note }: {
  readonly note: Pick<NotebookNote, 'id' | 'uid' | 'revision' | 'title'>;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteNoteAction({ id: note.id, uid: note.uid, expectedRevision: note.revision });
      if (!result.ok && result.code !== 'NOT_FOUND') {
        setError(result.code === 'CONFLICT' ? t.notebook.deleteConflict : result.message);
        return;
      }
      setOpen(false);
      router.push('/notebook');
    } catch {
      setError(t.notebook.deleteUncertain);
    } finally { setPending(false); }
  }

  return <>
    <button type="button" className={ui.dangerLink} onClick={() => { setError(null); setOpen(true); }}>
      {t.notebook.deleteNoteMenu}
    </button>
    <ConfirmDialog open={open} title={t.notebook.deleteTitle(note.title)} confirmLabel={t.notebook.deleteNote}
      pending={pending} error={error} onConfirm={() => { void remove(); }}
      onCancel={() => { setOpen(false); setError(null); }}>
      {t.notebook.deleteBody}
    </ConfirmDialog>
  </>;
}
