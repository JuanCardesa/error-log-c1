'use client';

import { useState, useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow } from '@/lib/domain/types';
import { createAnkiAction, markAddedAction, undoAddedAction, updateAnkiAction } from './actions';
import shared from '../_shared/report.module.css';
import styles from './anki.module.css';

/**
 * Una tarjeta pendiente. El boton sella `anki_added_at` con la hora del servidor.
 *
 * La `CONFUSION` se muestra como par mi-respuesta / correcta a proposito: el spec pide
 * tarjeta **de contraste** para esa causa, no una tarjeta suelta.
 */
export function QueueItem({ error, date, available }: { readonly error: ErrorRow; readonly date: string; readonly available: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
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

      <div className={styles.controls}>
      <button
        type="button"
        className={styles.add}
        disabled={pending || !available}
        aria-describedby={!available ? 'anki-status' : undefined}
        title={!available ? 'Abre Anki y pulsa Sincronizar para habilitar la creación.' : undefined}
        onClick={() => {
          startTransition(async () => {
            const result = await createAnkiAction(error.id);
            setMessage(result.message);
          });
        }}
      >
        {pending ? 'Creando…' : 'Crear en Anki'}
      </button>
      <button type="button" className={styles.manual} disabled={pending}
        onClick={() => startTransition(async () => { await markAddedAction(error.id); })}>
        Marcar a mano
      </button>
      {message !== '' && <p role="status">{message}</p>}
      </div>
    </li>
  );
}

/**
 * El boton solo sale si la tarjeta quedo vieja, pero el componente se monta siempre.
 *
 * Al actualizar, `revalidatePath` vuelve a pintar la lista y el error deja de estar
 * desfasado: si el componente fuese condicional, se desmontaria con su mensaje dentro y
 * el aviso de exito no llegaria a verse nunca.
 */
export function UpdateButton({ id, available, stale }: {
  readonly id: number; readonly available: boolean; readonly stale: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  if (!stale && message === '') return null;

  return (
    <>
      {stale && (
        <button
          type="button"
          className={styles.manual}
          disabled={pending || !available}
          title={available ? 'Reescribe la tarjeta con el texto actual del error.' : 'Abre Anki para poder actualizarla.'}
          onClick={() => {
            startTransition(async () => { setMessage((await updateAnkiAction(id)).message); });
          }}
        >
          {pending ? 'Actualizando…' : 'Actualizar en Anki'}
        </button>
      )}
      {message !== '' && <span role="status" className={shared.note}>{message}</span>}
    </>
  );
}

export function UndoButton({ id }: { readonly id: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.undo}
      title="Devuelve el error a la cola. La nota de Anki se conserva."
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
