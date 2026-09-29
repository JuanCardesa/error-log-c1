import Link from 'next/link';

import type { NotebookSearchHit } from '@/lib/db/notebookSearch';
import { findNotebookTextMatch, type NotebookTextMatch } from '@/lib/notebook/markdown';
import type { NotebookFolder } from '@/lib/notebook/types';
import { notebookNoteHref } from '@/lib/notebook/urls';
import styles from './notebook.module.css';

function MarkedText({ text, match }: { readonly text: string; readonly match: NotebookTextMatch | null }) {
  if (match === null) return text;
  return <>{text.slice(0, match.start)}<mark className={styles.searchMark}>{text.slice(match.start, match.end)}</mark>{text.slice(match.end)}</>;
}

export function NotebookSearchResults({ hits, folders, query }: {
  readonly hits: readonly NotebookSearchHit[];
  readonly folders: readonly NotebookFolder[];
  readonly query: string;
}) {
  return (
    <ul className={styles.searchResults}>
      {hits.map(({ note, excerpt, matchedIn }) => {
        const folder = folders.find((item) => item.id === note.folderId);
        const parent = folders.find((item) => item.id === folder?.parentId);
        const href = `${notebookNoteHref(note)}${excerpt?.heading === null || excerpt?.heading === undefined ? '' : `#${excerpt.heading.slug}`}`;
        return (
          <li key={note.id}>
            <p className={styles.resultPath}>
              Notebook · {parent === undefined ? '' : `${parent.name} / `}{folder?.name ?? 'Sin carpeta'}
              {excerpt?.heading !== null && excerpt?.heading !== undefined && ` / ${excerpt.heading.text}`}
            </p>
            <Link href={href} className={styles.noteLink}>
              <MarkedText text={note.title} match={findNotebookTextMatch(note.title, query)} />
            </Link>
            {excerpt !== null && (
              <p className={styles.resultSnippet}>
                <MarkedText text={excerpt.text} match={excerpt.match} />
              </p>
            )}
            {excerpt === null && matchedIn !== null && (
              <p className={styles.resultHint}>{matchedIn === 'title' ? 'Coincidencia en el título' : 'Coincidencia en una etiqueta'}</p>
            )}
            {note.tags.length > 0 && (
              <ul className={styles.resultTags} aria-label="Etiquetas">
                {note.tags.map((tag) => <li key={tag}><MarkedText text={tag} match={findNotebookTextMatch(tag, query)} /></li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
