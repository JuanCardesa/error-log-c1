'use client';

import { useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow } from '@/lib/domain/types';
import { markAddedAction, undoAddedAction } from './actions';
import styles from './anki.module.css';

/**
 * Una tarjeta pendiente. El boton sella `anki_added_at` con la hora del servidor.
 *
 * La `CONFUSION` se muestra como par mi-respuesta / correcta a proposito: el spec pide
 * tarjeta **de contraste** para esa causa, no una tarjeta suelta.
 */
export function QueueItem({ error, date }: { readonly error: ErrorRow; readonly date: string }) {
  const [pending, startTransition] = useTransition();
  const meta = CAUSE_META[error.cause];

  return (
    <li className={`${styles.card} ${pending ? styles.going : ''}`}>
      <div>
        <div className={styles.meta}>
          <span className="data">{date}</span>
          <span className={meta.side === 'study' ? styles.chipStudy : styles.chipExec}>
            {error.cause}
          </span>
          <span className="data">{error.category}</span>
          {error.subcategory !== null && <span className="data">· {error.subcategory}</span>}
          {error.confidence === 'SEGURO' && <strong>falsa certeza</strong>}
        </div>

        <p className={styles.prompt}>{error.prompt}</p>

        <p className={styles.answer}>
          {error.myAnswer !== null && <span className={styles.wrong}>{error.myAnswer}</span>}
          {error.myAnswer !== null && ' → '}
          <strong>{error.correctAnswer}</strong>
        </p>

        <p className={styles.rule}>{error.ruleNote}</p>
      </div>

      <button
        type="button"
        className={styles.add}
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await markAddedAction(error.id);
          });
        }}
      >
        {pending ? 'Sellando…' : 'Añadida'}
      </button>
    </li>
  );
}

export function UndoButton({ id }: { readonly id: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.undo}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await undoAddedAction(id);
        });
      }}
    >
      Deshacer
    </button>
  );
}
