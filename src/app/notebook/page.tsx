import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { listNotebookFolders, listNotebookNotes, listRecentNotebookNotes } from '@/lib/db/notebookRepo';
import { searchNotebookHits } from '@/lib/db/notebookSearch';
import { searchNotebookSchema } from '@/lib/notebook/schemas';
import { notebookNoteHref } from '@/lib/notebook/urls';
import type { NotebookNoteSummary } from '@/lib/notebook/types';
import { FolderManager } from './FolderManager';
import { NotebookDirectory } from './NotebookDirectory';
import { NotebookSearchControls } from './NotebookSearchControls';
import { NotebookSearchResults } from './NotebookSearchResults';
import styles from './notebook.module.css';

export const dynamic = 'force-dynamic';

type SearchParams = {
  readonly carpeta?: string | string[];
  readonly p?: string | string[];
  readonly q?: string | string[];
  readonly tag?: string | string[];
};

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function noteRows(notes: readonly NotebookNoteSummary[]) {
  return (
    <ul className={styles.noteList}>
      {notes.map((note) => (
        <li key={note.id}>
          <Link href={notebookNoteHref(note)} className={styles.noteLink}>{note.title}</Link>
          <time dateTime={note.updatedAt} className={styles.noteDate}>
            {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(note.updatedAt))}
          </time>
        </li>
      ))}
    </ul>
  );
}

export default async function NotebookPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const folderParam = one(params.carpeta);
  const query = one(params.q);
  const tag = one(params.tag);
  const searching = query.trim() !== '' || tag.trim() !== '';
  const db = getDb();
  const folders = listNotebookFolders(db);

  let selectedFolderId: number | null | undefined;
  let title = 'Modificados recientemente';
  if (folderParam === 'sin-carpeta') {
    selectedFolderId = null;
    title = 'Sin carpeta';
  } else if (folderParam !== '') {
    const id = Number(folderParam);
    if (!/^[1-9]\d*$/u.test(folderParam) || !Number.isSafeInteger(id)) notFound();
    const folder = folders.find((item) => item.id === id);
    if (folder === undefined) notFound();
    selectedFolderId = id;
    title = folder.name;
  }

  const pageParam = one(params.p);
  const parsedPage = Number(pageParam);
  const page = /^[1-9]\d*$/u.test(pageParam) && Number.isSafeInteger(parsedPage) ? parsedPage : 1;
  const searchInput = searching ? searchNotebookSchema.safeParse({
    query,
    folderId: typeof selectedFolderId === 'number' ? selectedFolderId : null,
    unfiledOnly: selectedFolderId === null,
    tag: tag.trim() === '' ? null : tag,
    page,
  }) : null;
  const searchResults = searchInput?.success === true ? searchNotebookHits(db, searchInput.data) : null;
  const listing = searching ? null : selectedFolderId === undefined
    ? { items: listRecentNotebookNotes(db), hasMore: false }
    : listNotebookNotes(db, selectedFolderId, page);
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (folderParam) query.set('carpeta', folderParam);
    if (searching && one(params.q).trim()) query.set('q', one(params.q).trim());
    if (searching && tag.trim()) query.set('tag', tag.trim());
    if (target > 1) query.set('p', String(target));
    const suffix = query.toString();
    return `/notebook${suffix ? `?${suffix}` : ''}`;
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Tu biblioteca de estudio</p>
          <h1 className={styles.pageTitle}>Notebook</h1>
          <p className={styles.intro}>Apuntes organizados por carpetas, con enlaces que conservan su ID al renombrarlos o moverlos.</p>
        </div>
        <Link href={selectedFolderId === undefined || selectedFolderId === null ? '/notebook/nuevo' : `/notebook/nuevo?carpeta=${String(selectedFolderId)}`}
          className={styles.newNoteLink}>Nuevo apunte</Link>
      </header>
      <NotebookSearchControls folders={folders} folderParam={folderParam} tag={tag} />
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <NotebookDirectory key={selectedFolderId ?? 'home'} folders={folders} selectedFolderId={selectedFolderId} />
          <FolderManager key={selectedFolderId ?? 'home'} folders={folders} selected={folders.find((item) => item.id === selectedFolderId)} />
        </aside>
        <section className={styles.content} aria-labelledby="notebook-list-title">
          <div className={styles.listHead}>
            <h2 id="notebook-list-title" className={styles.sectionTitle}>{searching ? 'Resultados de búsqueda' : title}</h2>
            {(selectedFolderId !== undefined || searching) && <Link href="/notebook" className={styles.backLink}>Ver recientes</Link>}
          </div>
          {searching && searchInput?.success === false && (
            <div role="alert" className={styles.empty}><p>Revisa la consulta o la etiqueta. La búsqueda admite hasta 200 caracteres.</p></div>
          )}
          {searchResults !== null && (searchResults.items.length > 0 ? (
            <NotebookSearchResults hits={searchResults.items} folders={folders} query={query} />
          ) : (
            <div className={styles.empty}>
              <p>No hay apuntes que coincidan con estos filtros.</p>
              <p>Prueba otra consulta, carpeta o etiqueta.</p>
            </div>
          ))}
          {listing !== null && (listing.items.length > 0 ? noteRows(listing.items) : (
            <div className={styles.empty}>
              <p>{selectedFolderId === undefined && folders.length === 0
                ? 'Tu Notebook está vacío.'
                : selectedFolderId === undefined
                  ? 'Todavía no hay apuntes.'
                  : 'Aquí aún no hay apuntes.'}</p>
              <p>Los apuntes que guardes aparecerán aquí.</p>
            </div>
          ))}
          {(searchResults !== null || listing !== null && selectedFolderId !== undefined)
            && (page > 1 || (searchResults?.hasMore ?? listing?.hasMore ?? false)) && (
            <nav aria-label="Páginas de apuntes" className={styles.pagination}>
              {page > 1 && <Link href={pageHref(page - 1)}>Anterior</Link>}
              <span>Página {page}</span>
              {(searchResults?.hasMore ?? listing?.hasMore ?? false) && <Link href={pageHref(page + 1)}>Siguiente</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
