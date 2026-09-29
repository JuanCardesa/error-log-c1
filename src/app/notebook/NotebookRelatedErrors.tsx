'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import type { NotebookLinkedError, NotebookPage } from '@/lib/notebook/types';
import { CorrectionPair } from '../_shared/CorrectionPair';
import { CATEGORY_LABELS } from '../_shared/labels';
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
      if (active) { setMessage('No se pudieron cargar los errores relacionados.'); setLoadedPage(page); }
    });
    return () => { active = false; };
  }, [noteId, page]);

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
        setMessage('No se pudo desvincular el error. Inténtalo de nuevo.');
      }
    });
  };

  return (
    <section className={styles.section} aria-label="Errores relacionados">
      <h2 className={styles.heading}>Errores relacionados</h2>
      {loading ? <p className={styles.muted}>Cargando errores…</p> : data.items.length === 0 ? (
        <p className={styles.muted}>Ningún error apunta todavía a este apunte.</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map(({ link, error, headingStatus }) => (
            <li key={error.id}>
              <Link href={`/errores?error=${String(error.id)}`} className={styles.correction}>
                <CorrectionPair mine={error.myAnswer} correct={error.correctAnswer} />
              </Link>
              <div className={styles.rowMeta}>
                <span className={ui.cellSub}>
                  {CATEGORY_LABELS[error.category]}
                  {error.itemRef !== null && ` · Ítem ${error.itemRef}`}
                </span>
                <button type="button" className={ui.textLink} disabled={pending} onClick={() => { remove(error.id); }}>
                  Desvincular
                </button>
              </div>
              {headingStatus === 'valid' && link.headingSlug !== null && (
                <a href={`#${link.headingSlug}`} className={styles.headingLink}>Apartado: {link.headingText}</a>
              )}
              {headingStatus === 'changed' && <p className={styles.changed}>Apartado cambiado · El enlace se conserva.</p>}
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || data.hasMore) && (
        <div className={styles.paging}>
          <button type="button" className={ui.ghost} disabled={page === 1 || loading} onClick={() => { setPage(page - 1); }}>Anterior</button>
          <span>Página {page}</span>
          <button type="button" className={ui.ghost} disabled={!data.hasMore || loading} onClick={() => { setPage(page + 1); }}>Siguiente</button>
        </div>
      )}
      {message !== null && <p role="alert" className={styles.error}>{message}</p>}
    </section>
  );
}
