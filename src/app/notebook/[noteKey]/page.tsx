import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { getNotebookNote, listFavoriteNotebookNotes, listNotebookAnnotations, listNotebookFolders } from '@/lib/db/notebookRepo';
import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import { notebookStudyText } from '@/lib/notebook/studyMarkdown';
import { notebookNoteHref, parseNotebookNoteId } from '@/lib/notebook/urls';
import { EmptyState } from '../../_shared/EmptyState';
import { getT } from '../../_shared/i18nServer';
import { NotebookStudy } from '../NotebookStudy';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { NotebookDirectory } from '../NotebookDirectory';
import { NotebookRelatedErrors } from '../NotebookRelatedErrors';
import { TableOfContents } from '../TableOfContents';
import { DeleteNotebookNote } from '../DeleteNotebookNote';
import { FavoriteToggle } from '../FavoriteToggle';
import ui from '../../_shared/ui.module.css';
import styles from '../notebook.module.css';

export const dynamic = 'force-dynamic';

export default async function NotebookNotePage({ params }: { readonly params: Promise<{ readonly noteKey: string }> }) {
  const { noteKey } = await params;
  const id = parseNotebookNoteId(noteKey);
  if (id === null) notFound();

  const t = await getT();
  const db = getDb();
  const note = getNotebookNote(db, id);
  if (note === null) notFound();
  const folders = listNotebookFolders(db);
  const favorites = listFavoriteNotebookNotes(db);
  const folder = folders.find((item) => item.id === note.folderId);
  const parent = folders.find((item) => item.id === folder?.parentId);
  const analysis = analyzeNotebookMarkdown(note.contentMarkdown);
  const { headings } = analysis;
  const titleHeading = headings[0]?.depth === 1 && headings[0].text === note.title ? headings[0] : null;

  return (
    <div className={styles.page}>
      <nav aria-label={t.notebook.breadcrumbs} className={styles.breadcrumbs}>
        <Link href="/notebook">{t.nav.notebook}</Link>
        {parent !== undefined && <><span aria-hidden="true">/</span><Link href={`/notebook?carpeta=${String(parent.id)}`}>{parent.name}</Link></>}
        <span aria-hidden="true">/</span>
        <Link href={folder === undefined ? '/notebook?carpeta=sin-carpeta' : `/notebook?carpeta=${String(folder.id)}`}>
          {folder?.name ?? t.notebook.noFolder}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{note.title}</span>
      </nav>
      <div className={`${styles.layout} ${headings.length > 0 ? styles.readerLayout : ''}`}>
        <aside className={styles.sidebar}>
          <NotebookDirectory folders={folders} favorites={favorites} selectedFolderId={note.folderId} />
        </aside>
        {headings.length > 0 && <aside className={styles.tocArea}>
          <TableOfContents key={note.id} headings={headings} />
        </aside>}
        <div className={styles.readerColumn}>
          <div className={styles.readerActions}>
            <FavoriteToggle id={note.id} title={note.title} favoritedAt={note.favoritedAt} />
            <a href={`/exportar/notebook-${String(note.id)}.md`} download className={ui.secondary}>{t.notebook.exportMd}</a>
            <Link href={`${notebookNoteHref(note)}/editar`} className={styles.newNoteLink}>{t.notebook.edit}</Link>
            <DeleteNotebookNote key={note.revision} note={{ id: note.id, uid: note.uid, revision: note.revision, title: note.title }} />
          </div>
          <article className={styles.reader}>
            <h1 id={titleHeading?.slug} className={styles.readerTitle}>{note.title}</h1>
            <div className={styles.meta}>
              <span>{t.notebook.modified} <time dateTime={note.updatedAt}>{new Intl.DateTimeFormat(t.format.intl, { dateStyle: 'long' }).format(new Date(note.updatedAt))}</time></span>
              {note.tags.length > 0 && <ul className={styles.tags} aria-label={t.notebook.tags}>
                {note.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>}
            </div>
            {note.contentMarkdown === '' ? (
              <EmptyState inset cause={t.notebook.noContent} />
            ) : (
              <NotebookStudy key={`${String(note.id)}-${String(note.revision)}`} noteId={note.id} uid={note.uid} revision={note.revision}
                text={notebookStudyText(note.contentMarkdown)} initialAnnotations={listNotebookAnnotations(db, note.id)}>
                <MarkdownRenderer markdown={note.contentMarkdown} analysis={analysis}
                  basePath={notebookNoteHref(note)} hideFirstH1={titleHeading !== null} study t={t} />
              </NotebookStudy>
            )}
          </article>
          <NotebookRelatedErrors key={note.id} noteId={note.id} />
        </div>
      </div>
    </div>
  );
}
