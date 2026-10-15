'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import type { NotebookFolder, NotebookNoteSummary } from '@/lib/notebook/types';
import { notebookNoteHref } from '@/lib/notebook/urls';
import { useT } from '../_shared/i18nClient';
import styles from './notebook.module.css';

export function NotebookDirectory({
  folders,
  favorites,
  selectedFolderId,
  favoritesView = false,
}: {
  readonly folders: readonly NotebookFolder[];
  readonly favorites: readonly NotebookNoteSummary[];
  readonly selectedFolderId?: number | null;
  readonly favoritesView?: boolean;
}) {
  const t = useT();
  const idPrefix = useId();
  const roots = folders.filter((folder) => folder.parentId === null);
  /**
   * Se recuerda lo que se cierra, no lo que se abre: así una carpeta recién creada
   * aparece desplegada sin tener que remontar el componente. Antes se remontaba con
   * `key` al cambiar de carpeta y cada navegación de cliente dejaba el `nav` anterior
   * pegado en el DOM, con el directorio repetido una vez por salto.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  return (
    <nav aria-label={t.notebook.directoryLabel} className={styles.directory}>
      <h2 className={styles.directoryTitle}>{t.notebook.directory}</h2>
      <div className={styles.favoriteDirectory}>
        <Link href="/notebook?vista=favoritos" aria-current={favoritesView ? 'page' : undefined}>
          {t.notebook.favorites} {favorites.length > 0 && <span>{favorites.length}</span>}
        </Link>
        {favorites.length > 0 && <ul className={styles.favoriteLinks}>
          {favorites.slice(0, 8).map((note) => <li key={note.id}>
            <Link href={notebookNoteHref(note)} title={note.title}>{note.title}</Link>
          </li>)}
        </ul>}
        {favorites.length > 8 && <Link href="/notebook?vista=favoritos" className={styles.favoriteAll}>
          {t.notebook.seeAll(favorites.length)}
        </Link>}
      </div>
      <ul className={styles.folderList}>
        <li>
          <Link href="/notebook" aria-current={selectedFolderId === undefined && !favoritesView ? 'page' : undefined}>
            {t.notebook.recent}
          </Link>
        </li>
        {roots.map((folder) => {
          const children = folders.filter((child) => child.parentId === folder.id);
          const isExpanded = !collapsed.has(folder.id);
          const childListId = `${idPrefix}-${String(folder.id)}`;
          return (
            <li key={folder.id}>
              <div className={styles.folderRow}>
                {children.length > 0 && (
                  <button
                    type="button"
                    className={styles.folderToggle}
                    aria-label={isExpanded ? t.notebook.collapse(folder.name) : t.notebook.expand(folder.name)}
                    aria-expanded={isExpanded}
                    aria-controls={childListId}
                    onClick={() => {
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        return next;
                      });
                    }}
                  >
                    {isExpanded ? '−' : '+'}
                  </button>
                )}
                <Link
                  href={`/notebook?carpeta=${String(folder.id)}`}
                  aria-current={selectedFolderId === folder.id ? 'page' : undefined}
                >
                  {folder.name}
                </Link>
              </div>
              {children.length > 0 && (
                <ul id={childListId} className={styles.subfolderList} hidden={!isExpanded}>
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/notebook?carpeta=${String(child.id)}`}
                        aria-current={selectedFolderId === child.id ? 'page' : undefined}
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        <li>
          <Link href="/notebook?carpeta=sin-carpeta" aria-current={selectedFolderId === null ? 'page' : undefined}>
            {t.notebook.noFolder}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
