'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { NotebookFolder } from '@/lib/notebook/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { createFolderAction, deleteFolderAction, updateFolderAction } from './actions';
import styles from './notebook.module.css';

export function FolderManager({
  folders,
  selected,
}: {
  readonly folders: readonly NotebookFolder[];
  readonly selected?: NotebookFolder;
}) {
  const t = useT();
  const n = t.notebook;
  const router = useRouter();
  const roots = folders.filter((folder) => folder.parentId === null);
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState<number | null>(selected?.parentId ?? selected?.id ?? null);
  const [name, setName] = useState(selected?.name ?? '');
  const [parentId, setParentId] = useState<number | null>(selected?.parentId ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createFolderAction({ name: newName, parentId: newParent });
      if (!result.ok) { setError(result.message); return; }
      router.push(`/notebook?carpeta=${String(result.data.id)}`);
      router.refresh();
    } catch {
      setError(n.createFolderFailed);
    } finally { setPending(false); }
  }

  async function updateFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === undefined) return;
    setPending(true);
    setError(null);
    try {
      const result = await updateFolderAction({ id: selected.id, name, parentId });
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    } catch {
      setError(n.saveFolderFailed);
    } finally { setPending(false); }
  }

  async function deleteFolder() {
    if (selected === undefined) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteFolderAction({ id: selected.id });
      if (!result.ok) { setError(result.message); setConfirmDelete(false); return; }
      setConfirmDelete(false);
      // Sin `router.refresh()` detrás: la acción ya revalidó /notebook y refrescar
      // mientras el push está en vuelo deja las dos páginas pintadas a la vez.
      router.push('/notebook');
    } catch {
      setError(n.deleteFolderFailed);
    } finally { setPending(false); }
  }

  return (
    <div className={styles.folderManager}>
      <details>
        <summary>{n.organiseFolders}</summary>
        <div className={styles.folderForms}>
          {error !== null && <p role="alert" className={ui.fieldError}>{error}</p>}
          <form onSubmit={(event) => { void createFolder(event); }} className={styles.folderForm}>
            <h3>{n.newFolder}</h3>
            <label className={ui.field}>{n.name}
              <input className={ui.input} value={newName} onChange={(event) => { setNewName(event.target.value); }} maxLength={80} required />
            </label>
            <label className={ui.field}>{n.location}
              <select className={ui.select} value={newParent ?? ''} onChange={(event) => { setNewParent(event.target.value === '' ? null : Number(event.target.value)); }}>
                <option value="">{n.root}</option>
                {roots.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <button type="submit" className={ui.secondary} disabled={pending}>{n.createFolder}</button>
          </form>
          {selected !== undefined && (
            <form onSubmit={(event) => { void updateFolder(event); }} className={styles.folderForm}>
              <h3>{n.editFolder(selected.name)}</h3>
              <label className={ui.field}>{n.name}
                <input className={ui.input} value={name} onChange={(event) => { setName(event.target.value); }} maxLength={80} required />
              </label>
              <label className={ui.field}>{n.location}
                <select className={ui.select} value={parentId ?? ''} onChange={(event) => { setParentId(event.target.value === '' ? null : Number(event.target.value)); }}>
                  <option value="">{n.root}</option>
                  {roots.filter((folder) => folder.id !== selected.id).map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </label>
              <div className={styles.folderActions}>
                <button type="submit" className={ui.secondary} disabled={pending}>{n.saveFolder}</button>
                <button type="button" className={ui.dangerLink} disabled={pending} onClick={() => { setConfirmDelete(true); }}>
                  {n.deleteFolderMenu}
                </button>
              </div>
            </form>
          )}
        </div>
      </details>
      <ConfirmDialog
        open={confirmDelete}
        title={n.deleteFolderTitle(selected?.name ?? null)}
        confirmLabel={n.deleteFolder}
        pending={pending}
        error={error}
        onConfirm={() => { void deleteFolder(); }}
        onCancel={() => { setConfirmDelete(false); setError(null); }}
      >
        {n.deleteFolderBody}
      </ConfirmDialog>
    </div>
  );
}
