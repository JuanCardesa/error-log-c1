'use client';

import { Ellipsis } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { NotebookNote } from '@/lib/notebook/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { useT } from '../_shared/i18nClient';
import { Menu } from '../_shared/Menu';
import overlay from '../_shared/overlay.module.css';
import ui from '../_shared/ui.module.css';
import { deleteNoteAction } from './actions';

/**
 * Lo que se hace de vez en cuando con un apunte, fuera de la vista de lectura: exportarlo y
 * borrarlo. Como en una sesión, Borrar va al final del menú y pide confirmación.
 */
export function NoteActionsMenu({ note }: {
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
    <Menu
      label={t.notebook.moreActions}
      trigger={(props) => (
        <button type="button" {...props} className={`${ui.iconButton} ${ui.iconBordered} ${ui.iconLarge}`} aria-label={t.notebook.moreActions}>
          <Ellipsis size={18} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <a role="menuitem" href={`/exportar/notebook-${String(note.id)}.md`} download className={overlay.menuItem} onClick={close}>
            {t.notebook.exportMd}
          </a>
          <div className={overlay.menuSep} role="separator" />
          <button type="button" role="menuitem" className={`${overlay.menuItem} ${overlay.menuItemDanger}`}
            onClick={() => { close(); setError(null); setOpen(true); }}>
            {t.notebook.deleteNoteMenu}
          </button>
        </>
      )}
    </Menu>
    <ConfirmDialog open={open} title={t.notebook.deleteTitle(note.title)} confirmLabel={t.notebook.deleteNote}
      pending={pending} error={error} onConfirm={() => { void remove(); }}
      onCancel={() => { setOpen(false); setError(null); }}>
      {t.notebook.deleteBody}
    </ConfirmDialog>
  </>;
}
