'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { NotebookFolder } from '@/lib/notebook/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
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
      setError('No se pudo crear la carpeta. Inténtalo de nuevo.');
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
      setError('No se pudo guardar la carpeta. Inténtalo de nuevo.');
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
      router.push('/notebook');
      router.refresh();
    } catch {
      setError('No se pudo borrar la carpeta. Inténtalo de nuevo.');
    } finally { setPending(false); }
  }

  return (
    <div className={styles.folderManager}>
      <details>
        <summary>Organizar carpetas</summary>
        <div className={styles.folderForms}>
          {error !== null && <p role="alert" className={ui.fieldError}>{error}</p>}
          <form onSubmit={(event) => { void createFolder(event); }} className={styles.folderForm}>
            <h3>Nueva carpeta</h3>
            <label className={ui.field}>Nombre
              <input className={ui.input} value={newName} onChange={(event) => { setNewName(event.target.value); }} maxLength={80} required />
            </label>
            <label className={ui.field}>Ubicación
              <select className={ui.select} value={newParent ?? ''} onChange={(event) => { setNewParent(event.target.value === '' ? null : Number(event.target.value)); }}>
                <option value="">Raíz</option>
                {roots.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <button type="submit" className={ui.secondary} disabled={pending}>Crear carpeta</button>
          </form>
          {selected !== undefined && (
            <form onSubmit={(event) => { void updateFolder(event); }} className={styles.folderForm}>
              <h3>Editar {selected.name}</h3>
              <label className={ui.field}>Nombre
                <input className={ui.input} value={name} onChange={(event) => { setName(event.target.value); }} maxLength={80} required />
              </label>
              <label className={ui.field}>Ubicación
                <select className={ui.select} value={parentId ?? ''} onChange={(event) => { setParentId(event.target.value === '' ? null : Number(event.target.value)); }}>
                  <option value="">Raíz</option>
                  {roots.filter((folder) => folder.id !== selected.id).map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </label>
              <div className={styles.folderActions}>
                <button type="submit" className={ui.secondary} disabled={pending}>Guardar carpeta</button>
                <button type="button" className={ui.dangerLink} disabled={pending} onClick={() => { setConfirmDelete(true); }}>
                  Borrar carpeta…
                </button>
              </div>
            </form>
          )}
        </div>
      </details>
      <ConfirmDialog
        open={confirmDelete}
        title={`Borrar ${selected?.name ?? 'carpeta'}`}
        confirmLabel="Borrar carpeta"
        pending={pending}
        error={error}
        onConfirm={() => { void deleteFolder(); }}
        onCancel={() => { setConfirmDelete(false); setError(null); }}
      >
        Solo se puede borrar una carpeta vacía. Esta acción no se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}
