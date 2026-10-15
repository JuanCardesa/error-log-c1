import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { listFavoriteNotebookNotes, listNotebookFolders, listRecentNotebookNotes } from '@/lib/db/notebookRepo';
import { searchNotebookHits, searchNotebookNotes } from '@/lib/db/notebookSearch';
import { searchNotebookSchema } from '@/lib/notebook/schemas';
import { notebookNoteHref } from '@/lib/notebook/urls';
import type { NotebookNoteSummary } from '@/lib/notebook/types';
import type { Messages } from '@/lib/i18n';
import { getT } from '../_shared/i18nServer';
import ui from '../_shared/ui.module.css';
import { FolderManager } from './FolderManager';
import { FavoriteToggle } from './FavoriteToggle';
import { NotebookDraftNotice } from './NotebookDraftNotice';
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
  readonly vista?: string | string[];
};

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function noteRows(notes: readonly NotebookNoteSummary[], t: Messages) {
  return (
    <ul className={styles.noteList}>
      {notes.map((note) => (
        <li key={note.id}>
          <div className={styles.noteRowMain}>
            <FavoriteToggle id={note.id} title={note.title} favoritedAt={note.favoritedAt} compact />
            <Link href={notebookNoteHref(note)} className={styles.noteLink}>{note.title}</Link>
          </div>
          <time dateTime={note.updatedAt} className={styles.noteDate}>
            {new Intl.DateTimeFormat(t.format.intl, { dateStyle: 'medium' }).format(new Date(note.updatedAt))}
          </time>
        </li>
      ))}
    </ul>
  );
}

export default async function NotebookPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const n = t.notebook;
  const folderParam = one(params.carpeta);
  const query = one(params.q);
  const tag = one(params.tag);
  const searching = query.trim() !== '' || tag.trim() !== '';
  const view = one(params.vista);
  if (view !== '' && view !== 'favoritos') notFound();
  const favoritesView = view === 'favoritos' && !searching;
  const db = getDb();
  const folders = listNotebookFolders(db);
  const favorites = listFavoriteNotebookNotes(db);

  let selectedFolderId: number | null | undefined;
  let title = n.recentlyModified;
  if (folderParam === 'sin-carpeta') {
    selectedFolderId = null;
    title = n.noFolder;
  } else if (folderParam !== '') {
    const id = Number(folderParam);
    if (!/^[1-9]\d*$/u.test(folderParam) || !Number.isSafeInteger(id)) notFound();
    const folder = folders.find((item) => item.id === id);
    if (folder === undefined) notFound();
    selectedFolderId = id;
    title = folder.name;
  }
  if (favoritesView) {
    selectedFolderId = undefined;
    title = n.favorites;
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
  const listing = searching ? null : favoritesView
    ? { items: favorites, hasMore: false }
    : selectedFolderId === undefined
    ? { items: listRecentNotebookNotes(db), hasMore: false }
    : searchNotebookNotes(db, {
      query: '', folderId: selectedFolderId, unfiledOnly: selectedFolderId === null, tag: null, page,
    });
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
          <p className={styles.eyebrow}>{n.eyebrow}</p>
          <h1 className={styles.pageTitle}>{t.nav.notebook}</h1>
          <p className={styles.intro}>{n.intro}</p>
        </div>
        <div className={styles.headActions}>
          <Link href={selectedFolderId === undefined || selectedFolderId === null ? '/notebook/importar' : `/notebook/importar?carpeta=${String(selectedFolderId)}`}
            className={ui.secondary}>{n.importMd}</Link>
          <Link href={selectedFolderId === undefined || selectedFolderId === null ? '/notebook/nuevo' : `/notebook/nuevo?carpeta=${String(selectedFolderId)}`}
            className={styles.newNoteLink}>{n.newNote}</Link>
        </div>
      </header>
      <NotebookDraftNotice />
      <NotebookSearchControls folders={folders} folderParam={folderParam} tag={tag} t={t} />
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <NotebookDirectory folders={folders} favorites={favorites} selectedFolderId={selectedFolderId} favoritesView={favoritesView} />
          <FolderManager key={selectedFolderId ?? 'home'} folders={folders} selected={folders.find((item) => item.id === selectedFolderId)} />
        </aside>
        <section className={styles.content} aria-labelledby="notebook-list-title">
          <div className={styles.listHead}>
            <h2 id="notebook-list-title" className={styles.sectionTitle}>{searching ? n.searchResults : title}</h2>
            {(selectedFolderId !== undefined || searching || favoritesView) && <Link href="/notebook" className={styles.backLink}>{n.seeRecent}</Link>}
          </div>
          {searching && searchInput?.success === false && (
            <div role="alert" className={styles.empty}><p>{n.checkQuery}</p></div>
          )}
          {searchResults !== null && (searchResults.items.length > 0 ? (
            <NotebookSearchResults hits={searchResults.items} folders={folders} query={query} t={t} />
          ) : (
            <div className={styles.empty}>
              <p>{n.noMatch}</p>
              <p>{n.tryAnother}</p>
            </div>
          ))}
          {listing !== null && (listing.items.length > 0 ? noteRows(listing.items, t) : (
            <div className={styles.empty}>
              <p>{favoritesView ? n.noFavorites : selectedFolderId === undefined && folders.length === 0
                ? n.emptyNotebook
                : selectedFolderId === undefined
                  ? n.noNotesYet
                  : n.noNotesHere}</p>
              <p>{favoritesView ? n.favoritesHint : n.savedAppearHere}</p>
            </div>
          ))}
          {(searchResults !== null || listing !== null && selectedFolderId !== undefined && !favoritesView)
            && (page > 1 || (searchResults?.hasMore ?? listing?.hasMore ?? false)) && (
            <nav aria-label={n.pages} className={styles.pagination}>
              {page > 1 && <Link href={pageHref(page - 1)}>{t.common.previous}</Link>}
              <span>{t.common.page(page)}</span>
              {(searchResults?.hasMore ?? listing?.hasMore ?? false) && <Link href={pageHref(page + 1)}>{t.common.next}</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
