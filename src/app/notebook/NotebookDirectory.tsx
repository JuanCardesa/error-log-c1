'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import type { NotebookFolder } from '@/lib/notebook/types';
import styles from './notebook.module.css';

export function NotebookDirectory({
  folders,
  selectedFolderId,
}: {
  readonly folders: readonly NotebookFolder[];
  readonly selectedFolderId?: number | null;
}) {
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
    <nav aria-label="Directorio de Notebook" className={styles.directory}>
      <h2 className={styles.directoryTitle}>Directorio</h2>
      <ul className={styles.folderList}>
        <li>
          <Link href="/notebook" aria-current={selectedFolderId === undefined ? 'page' : undefined}>
            Recientes
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
                    aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${folder.name}`}
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
            Sin carpeta
          </Link>
        </li>
      </ul>
    </nav>
  );
}
