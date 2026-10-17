'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { ErrorRow, SessionRow } from '@/lib/domain/types';
import { CorrectionPair } from '../CorrectionPair';
import { sessionTitle, shortDate } from '../format';
import { useT } from '../i18nClient';
import { ankiState } from '../labels';
import { AnkiStateText } from './AnkiStateText';
import { ErrorDetailPanel } from './ErrorDetailPanel';
import styles from './explorer.module.css';
import ui from '../ui.module.css';

/**
 * Lista de errores con un detalle al lado. Seleccionar una fila abre el caso completo sin
 * salir de la lista; la selección viaja en la URL (`error=ID`) para poder enlazarla, pero
 * se escribe con `history.replaceState`: elegir una fila no vuelve a pedir la página.
 *
 * - `session`: los errores de una sesión (Ítem · pareja · Categoría · Causa · Anki).
 * - `global`: errores de cualquier sesión (Corrección · Contexto · Sesión · Anki). Con
 *   `showCause`, también la Causa (Falsas certezas: separa el despiste del desconocimiento).
 *
 * Con `paging`, la posición del detalle se cuenta sobre todos los resultados («26 de 27») y
 * las flechas siguen en la página de al lado al llegar al borde de esta.
 */

export interface ExplorerRow {
  readonly error: ErrorRow;
  readonly session: SessionRow;
}

export interface ExplorerPaging {
  /** Resultados que van antes de esta página. */
  readonly offset: number;
  readonly total: number;
  /** Página anterior y siguiente (con vuelta), o null si solo hay una. */
  readonly prevHref: string | null;
  readonly nextHref: string | null;
}

export function ErrorExplorer({
  rows,
  mode,
  initialSelectedId,
  outsideSelected = null,
  subcategorySuggestions,
  empty,
  caption,
  paging = null,
  showCause = false,
}: {
  readonly rows: readonly ExplorerRow[];
  readonly mode: 'session' | 'global';
  readonly initialSelectedId: number | null;
  /** Error pedido por URL que no está en la página actual de la lista. */
  readonly outsideSelected?: ExplorerRow | null;
  readonly subcategorySuggestions: readonly string[];
  readonly empty: ReactNode;
  readonly caption: string;
  readonly paging?: ExplorerPaging | null;
  readonly showCause?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);
  const openerId = useRef<number | null>(null);

  const index = rows.findIndex((row) => row.error.id === selectedId);
  const selected = index >= 0 ? rows[index] : outsideSelected?.error.id === selectedId ? outsideSelected : undefined;
  const open = selected !== undefined && selected !== null;

  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get('error');
    const next = open ? String(selected.error.id) : null;
    if (current === next && !url.searchParams.has('at')) return;
    // `at` solo sirve para abrir el primero o el último al cambiar de página.
    url.searchParams.delete('at');
    if (next === null) url.searchParams.delete('error');
    else url.searchParams.set('error', next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [open, selected]);

  const step = (delta: number) => {
    if (rows.length === 0) return;
    const from = index >= 0 ? index : 0;
    const target = from + delta;
    // En el borde de la página se sigue en la de al lado, no se vuelve al principio de esta.
    const edge = target < 0 ? paging?.prevHref : target >= rows.length ? paging?.nextHref : null;
    if (edge !== null && edge !== undefined) {
      router.push(`${edge}${edge.includes('?') ? '&' : '?'}at=${delta > 0 ? 'first' : 'last'}`, { scroll: false });
      return;
    }
    const next = rows[(target + rows.length) % rows.length];
    if (next !== undefined) setSelectedId(next.error.id);
  };

  const position = index < 0 ? null
    : paging === null ? { index, total: rows.length } : { index: paging.offset + index, total: paging.total };

  const afterDelete = () => {
    // Al siguiente de la lista, o se cierra si era el último.
    const next = rows[index + 1] ?? rows[index - 1];
    setSelectedId(next === undefined || next.error.id === selectedId ? null : next.error.id);
  };

  if (rows.length === 0 && !open) return <>{empty}</>;

  return (
    <div className={`${styles.explorer} ${open ? styles.withPanel : ''}`}>
      <div className={ui.scrollX}>
        <table className={`${ui.dataTable} ${ui.dataTableFixed} ${mode === 'session' ? styles.sessionMode : styles.globalMode} ${showCause ? styles.withCause : ''} ${open ? styles.narrow : ''}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            {mode === 'session' ? (
              <tr>
                <th scope="col" className={styles.colItem}>{t.errorForm.item}</th>
                <th scope="col">{t.errors.answerToCorrection}</th>
                <th scope="col" className={styles.colCategory}>{t.errorForm.category}</th>
                <th scope="col" className={`${styles.colCause} ${styles.wide}`}>{t.errorForm.cause}</th>
                <th scope="col" className={`${ui.colStatus} ${styles.colAnki} ${styles.wide}`}>Anki</th>
              </tr>
            ) : (
              <tr>
                <th scope="col" className={styles.colCorrection}>{t.correction.correction}</th>
                <th scope="col" className={styles.wide}>{t.errors.context}</th>
                {showCause && <th scope="col" className={styles.colCause}>{t.errorForm.cause}</th>}
                <th scope="col" className={styles.colSession}>{t.errors.session}</th>
                <th scope="col" className={`${ui.colStatus} ${styles.colAnki}`}>Anki</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row) => {
              const { error, session } = row;
              const isSelected = error.id === selectedId;
              const state = ankiState(error);
              const select = () => { openerId.current = error.id; setSelectedId(error.id); };
              const label = t.errors.viewError(error.itemRef, error.correctAnswer);
              return (
                <tr
                  key={error.id}
                  data-clickable
                  data-selected={isSelected || undefined}
                  onClick={select}
                >
                  {mode === 'session' ? (
                    <>
                      <td className={`${styles.colItem} ${styles.mono}`}>{error.itemRef ?? '—'}</td>
                      <td>
                        <button type="button" className={styles.rowButton} aria-label={label} aria-current={isSelected || undefined} data-error-row={error.id} onClick={(event) => { event.stopPropagation(); select(); }}>
                          <CorrectionPair mine={error.myAnswer} correct={error.correctAnswer} />
                        </button>
                      </td>
                      <td className={styles.colCategory}>{t.labels.category[error.category]}</td>
                      <td className={`${styles.colCause} ${styles.wide}`}>{t.labels.cause[error.cause]}</td>
                      <td className={`${ui.colStatus} ${styles.colAnki} ${styles.wide}`}><AnkiStateText state={state} /></td>
                    </>
                  ) : (
                    <>
                      <td className={styles.colCorrection}>
                        <button type="button" className={styles.rowButton} aria-label={label} aria-current={isSelected || undefined} data-error-row={error.id} onClick={(event) => { event.stopPropagation(); select(); }}>
                          <span className={styles.correctMono}>{error.correctAnswer}</span>
                          <span className={ui.cellSub}>
                            {t.labels.category[error.category]}
                            {/* En móvil no cabe la columna Sesión: su fecha va aquí. */}
                            <span className={styles.subDate}> · {shortDate(session.date, t)}</span>
                          </span>
                        </button>
                      </td>
                      <td className={`${styles.wide} ${styles.context}`}>
                        <span className={ui.ellipsis}>{error.prompt}</span>
                      </td>
                      {showCause && <td className={styles.colCause}>{t.labels.cause[error.cause]}</td>}
                      <td className={styles.colSession}>
                        <span className={ui.cellStack}>
                          <span className={ui.ellipsis}>{sessionTitle(session, t)}</span>
                          <span className={ui.cellSub}>{shortDate(session.date, t)}</span>
                        </span>
                      </td>
                      <td className={`${ui.colStatus} ${styles.colAnki}`}><AnkiStateText state={state} /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <ErrorDetailPanel
          error={selected.error}
          session={selected.session}
          position={position}
          onPrev={() => { step(-1); }}
          onNext={() => { step(1); }}
          onClose={() => {
            // El foco vuelve a la fila de la que salió el detalle.
            const id = openerId.current ?? selected.error.id;
            openerId.current = null;
            setSelectedId(null);
            requestAnimationFrame(() => {
              const row = document.querySelector<HTMLElement>(`[data-error-row="${String(id)}"]`);
              (row ?? document.querySelector<HTMLElement>('[data-error-row]'))?.focus();
            });
          }}
          onDeleted={afterDelete}
          subcategorySuggestions={subcategorySuggestions}
          showSessionLink={mode === 'global'}
        />
      )}
    </div>
  );
}
