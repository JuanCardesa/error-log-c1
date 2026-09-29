import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { getNotebookNote, listNotebookFolders } from '@/lib/db/notebookRepo';
import { notebookNoteHref, parseNotebookNoteId } from '@/lib/notebook/urls';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { NotebookDirectory } from '../NotebookDirectory';
import styles from '../notebook.module.css';

export const dynamic = 'force-dynamic';

export default async function NotebookNotePage({ params }: { readonly params: Promise<{ readonly noteKey: string }> }) {
  const { noteKey } = await params;
  const id = parseNotebookNoteId(noteKey);
  if (id === null) notFound();

  const db = getDb();
  const note = getNotebookNote(db, id);
  if (note === null) notFound();
  const folders = listNotebookFolders(db);
  const folder = folders.find((item) => item.id === note.folderId);
  const parent = folders.find((item) => item.id === folder?.parentId);

  return (
    <div className={styles.page}>
      <nav aria-label="Ruta del apunte" className={styles.breadcrumbs}>
        <Link href="/notebook">Notebook</Link>
        {parent !== undefined && <><span aria-hidden="true">/</span><Link href={`/notebook?carpeta=${String(parent.id)}`}>{parent.name}</Link></>}
        <span aria-hidden="true">/</span>
        <Link href={folder === undefined ? '/notebook?carpeta=sin-carpeta' : `/notebook?carpeta=${String(folder.id)}`}>
          {folder?.name ?? 'Sin carpeta'}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{note.title}</span>
      </nav>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <NotebookDirectory key={note.folderId ?? 'unfiled'} folders={folders} selectedFolderId={note.folderId} />
        </aside>
        <article className={styles.reader}>
          <h1 className={styles.readerTitle}>{note.title}</h1>
          <div className={styles.meta}>
            <span>Modificado <time dateTime={note.updatedAt}>{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(note.updatedAt))}</time></span>
            {note.tags.length > 0 && <ul className={styles.tags} aria-label="Etiquetas">
              {note.tags.map((tag) => <li key={tag}>{tag}</li>)}
            </ul>}
          </div>
          {note.contentMarkdown === '' ? (
            <div className={styles.empty}><p>Este apunte todavía no tiene contenido.</p></div>
          ) : (
            <MarkdownRenderer markdown={note.contentMarkdown} basePath={notebookNoteHref(note)} />
          )}
        </article>
      </div>
    </div>
  );
}
