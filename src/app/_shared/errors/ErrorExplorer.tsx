'use client';

import { useEffect, useState, type ReactNode } from 'react';

import type { ErrorRow, SessionRow } from '@/lib/domain/types';
import { CorrectionPair } from '../CorrectionPair';
import { sessionTitle, shortDate } from '../format';
import { ANKI_STATE_LABELS, CATEGORY_LABELS, CAUSE_LABELS, ankiState } from '../labels';
import { ankiClass } from './ankiClass';
import { ErrorDetailPanel } from './ErrorDetailPanel';
import styles from './explorer.module.css';
import ui from '../ui.module.css';

/**
 * Lista de errores con un detalle al lado. Seleccionar una fila abre el caso completo sin
 * salir de la lista; la selección viaja en la URL (`error=ID`) para poder enlazarla, pero
 * se escribe con `history.replaceState`: elegir una fila no vuelve a pedir la página.
 *
 * - `session`: los errores de una sesión (Ítem · pareja · Categoría · Causa · Anki).
 * - `global`: errores de cualquier sesión (Corrección · Contexto · Sesión · Anki).
 */

export interface ExplorerRow {
  readonly error: ErrorRow;
  readonly session: SessionRow;
}

export function ErrorExplorer({
  rows,
  mode,
  initialSelectedId,
  outsideSelected = null,
  subcategorySuggestions,
  empty,
  caption,
}: {
  readonly rows: readonly ExplorerRow[];
  readonly mode: 'session' | 'global';
  readonly initialSelectedId: number | null;
  /** Error pedido por URL que no está en la página actual de la lista. */
  readonly outsideSelected?: ExplorerRow | null;
  readonly subcategorySuggestions: readonly string[];
  readonly empty: ReactNode;
  readonly caption: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);

  const index = rows.findIndex((row) => row.error.id === selectedId);
  const selected = index >= 0 ? rows[index] : outsideSelected?.error.id === selectedId ? outsideSelected : undefined;
  const open = selected !== undefined && selected !== null;

  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get('error');
    const next = open ? String(selected.error.id) : null;
    if (current === next) return;
    if (next === null) url.searchParams.delete('error');
    else url.searchParams.set('error', next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [open, selected]);

  const step = (delta: number) => {
    if (rows.length === 0) return;
    const from = index >= 0 ? index : 0;
    const next = rows[(from + delta + rows.length) % rows.length];
    if (next !== undefined) setSelectedId(next.error.id);
  };

  const afterDelete = () => {
    // Al siguiente de la lista, o se cierra si era el último.
    const next = rows[index + 1] ?? rows[index - 1];
    setSelectedId(next === undefined || next.error.id === selectedId ? null : next.error.id);
  };

  if (rows.length === 0 && !open) return <>{empty}</>;

  return (
    <div className={`${styles.explorer} ${open ? styles.withPanel : ''}`}>
      <div className={ui.scrollX}>
        <table className={`${styles.table} ${mode === 'session' ? styles.sessionMode : styles.globalMode} ${open ? styles.narrow : ''}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            {mode === 'session' ? (
              <tr>
                <th scope="col" className={styles.colItem}>Ítem</th>
                <th scope="col">Tu respuesta → Corrección</th>
                <th scope="col" className={styles.colCategory}>Categoría</th>
                <th scope="col" className={`${styles.colCause} ${styles.wide}`}>Causa</th>
                <th scope="col" className={`${styles.colAnki} ${styles.wide}`}>Anki</th>
              </tr>
            ) : (
              <tr>
                <th scope="col" className={styles.colCorrection}>Corrección</th>
                <th scope="col" className={styles.wide}>Contexto</th>
                <th scope="col" className={styles.colSession}>Sesión</th>
                <th scope="col" className={styles.colAnki}>Anki</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row) => {
              const { error, session } = row;
              const isSelected = error.id === selectedId;
              const state = ankiState(error);
              const select = () => { setSelectedId(error.id); };
              const label = error.itemRef === null ? `Ver error: ${error.correctAnswer}` : `Ver error ${error.itemRef}: ${error.correctAnswer}`;
              return (
                <tr
                  key={error.id}
                  className={isSelected ? styles.selected : undefined}
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
                      <td className={styles.colCategory}>{CATEGORY_LABELS[error.category]}</td>
                      <td className={`${styles.colCause} ${styles.wide}`}>{CAUSE_LABELS[error.cause]}</td>
                      <td className={`${styles.colAnki} ${styles.wide} ${ankiClass(state)}`}>{ANKI_STATE_LABELS[state]}</td>
                    </>
                  ) : (
                    <>
                      <td className={styles.colCorrection}>
                        <button type="button" className={styles.rowButton} aria-label={label} aria-current={isSelected || undefined} data-error-row={error.id} onClick={(event) => { event.stopPropagation(); select(); }}>
                          <span className={styles.correctMono}>{error.correctAnswer}</span>
                          <span className={ui.cellSub}>{CATEGORY_LABELS[error.category]}</span>
                        </button>
                      </td>
                      <td className={`${styles.wide} ${styles.context}`}>
                        <span className={ui.ellipsis}>{error.prompt}</span>
                      </td>
                      <td className={styles.colSession}>
                        <span className={ui.cellStack}>
                          <span className={ui.ellipsis}>{sessionTitle(session)}</span>
                          <span className={ui.cellSub}>{shortDate(session.date)}</span>
                        </span>
                      </td>
                      <td className={`${styles.colAnki} ${ankiClass(state)}`}>{ANKI_STATE_LABELS[state]}</td>
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
          position={index >= 0 ? { index, total: rows.length } : null}
          onPrev={() => { step(-1); }}
          onNext={() => { step(1); }}
          onClose={() => {
            // El foco vuelve a la fila de la que salió el detalle.
            const id = selected.error.id;
            setSelectedId(null);
            requestAnimationFrame(() => { document.querySelector<HTMLElement>(`[data-error-row="${String(id)}"]`)?.focus(); });
          }}
          onDeleted={afterDelete}
          subcategorySuggestions={subcategorySuggestions}
          showSessionLink={mode === 'global'}
        />
      )}
    </div>
  );
}
