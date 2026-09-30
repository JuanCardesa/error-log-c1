'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { NotebookNote } from '@/lib/notebook/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import ui from '../_shared/ui.module.css';
import { deleteNoteAction } from './actions';

export function DeleteNotebookNote({ note }: {
  readonly note: Pick<NotebookNote, 'id' | 'uid' | 'revision' | 'title'>;
}) {
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
        setError(result.code === 'CONFLICT'
          ? 'El apunte ha cambiado. Cancela y recarga la página para revisar la versión actual antes de borrarlo.'
          : result.message);
        return;
      }
      setOpen(false);
      router.push('/notebook');
    } catch {
      setError('No se pudo confirmar el borrado. Inténtalo de nuevo.');
    } finally { setPending(false); }
  }

  return <>
    <button type="button" className={ui.dangerLink} onClick={() => { setError(null); setOpen(true); }}>
      Borrar apunte…
    </button>
    <ConfirmDialog open={open} title={`Borrar ${note.title}`} confirmLabel="Borrar apunte"
      pending={pending} error={error} onConfirm={() => { void remove(); }}
      onCancel={() => { setOpen(false); setError(null); }}>
      Se borrará este apunte y sus vínculos con Error Log. Los errores se conservarán.
      Esta acción no se puede deshacer.
    </ConfirmDialog>
  </>;
}
