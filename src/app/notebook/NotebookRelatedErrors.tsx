'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import type { NotebookLinkedError, NotebookPage } from '@/lib/notebook/types';
import { CorrectionPair } from '../_shared/CorrectionPair';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { getNoteErrorLinksAction, removeErrorNoteLinkAction } from './actions';
import styles from './relatedErrors.module.css';

const EMPTY_PAGE: NotebookPage<NotebookLinkedError> = { items: [], hasMore: false };

/**
 * Reverso de ErrorNotebookLinks: los errores que citan este apunte. El vínculo solo se crea
 * desde el error (TASK 5.2); aquí se lee y se puede desvincular, pero no se elige un apunte.
 * `#slug` reutiliza los anclajes del propio lector (TASK 3.3): saltan dentro de esta misma
 * página en vez de abrir el error para ver a qué apartado apuntaba.
 */
export function NotebookRelatedErrors({ noteId }: { readonly noteId: number }) {
  const t = useT();
  const [page, setPage] = useState(1);
  // `loadedPage` se queda atrás mientras la página pedida está en vuelo: de ahí sale
  // `loading`, sin tocar el estado de forma sincrona dentro del efecto.
  const [loadedPage, setLoadedPage] = useState(0);
  const [data, setData] = useState(EMPTY_PAGE);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const loading = loadedPage !== page;

  useEffect(() => {
    let active = true;
    getNoteErrorLinksAction({ noteId, page }).then((result) => {
      if (!active) return;
      if (result.ok) { setData(result.data); setMessage(null); }
      else setMessage(result.message);
      setLoadedPage(page);
    }).catch(() => {
      if (active) { setMessage(t.notebook.relatedLoadFailed); setLoadedPage(page); }
    });
    return () => { active = false; };
  }, [noteId, page, t]);

  const remove = (errorId: number) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await removeErrorNoteLinkAction({ errorId, noteId });
        if (!result.ok) { setMessage(result.message); return; }
        const refreshed = await getNoteErrorLinksAction({ noteId, page });
        if (!refreshed.ok) { setMessage(refreshed.message); return; }
        // La página se queda sin filas al borrar la última: se retrocede en vez de mostrarla vacía.
        if (refreshed.data.items.length === 0 && page > 1) { setPage(page - 1); return; }
        setData(refreshed.data);
      } catch {
        setMessage(t.notebook.unlinkErrorFailed);
      }
    });
  };

  return (
    <section className={styles.section} aria-label={t.notebook.relatedErrors}>
      <h2 className={styles.heading}>{t.notebook.relatedErrors}</h2>
      {loading ? <p className={styles.muted}>{t.notebook.loadingErrors}</p> : data.items.length === 0 ? (
        <p className={styles.muted}>{t.notebook.noRelated}</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map(({ link, error, headingStatus }) => (
            <li key={error.id}>
              <Link href={`/errores?error=${String(error.id)}`} className={styles.correction}>
                <CorrectionPair mine={error.myAnswer} correct={error.correctAnswer} />
              </Link>
              <div className={styles.rowMeta}>
                <span className={ui.cellSub}>
                  {t.labels.category[error.category]}
                  {error.itemRef !== null && t.notebook.itemSuffix(error.itemRef)}
                </span>
                <button type="button" className={ui.textLink} disabled={pending} onClick={() => { remove(error.id); }}>
                  {t.noteLinks.unlink}
                </button>
              </div>
              {headingStatus === 'valid' && link.headingSlug !== null && (
                <a href={`#${link.headingSlug}`} className={styles.headingLink}>{t.noteLinks.sectionValue(link.headingText ?? '')}</a>
              )}
              {headingStatus === 'changed' && <p className={styles.changed}>{t.notebook.sectionChangedLinkKept}</p>}
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || data.hasMore) && (
        <div className={styles.paging}>
          <button type="button" className={ui.ghost} disabled={page === 1 || loading} onClick={() => { setPage(page - 1); }}>{t.common.previous}</button>
          <span>{t.common.page(page)}</span>
          <button type="button" className={ui.ghost} disabled={!data.hasMore || loading} onClick={() => { setPage(page + 1); }}>{t.common.next}</button>
        </div>
      )}
      {message !== null && <p role="alert" className={styles.error}>{message}</p>}
    </section>
  );
}
