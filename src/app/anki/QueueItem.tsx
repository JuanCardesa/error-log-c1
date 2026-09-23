'use client';

import Link from 'next/link';
import { useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow } from '@/lib/domain/types';
import { createAnkiAction, undoAddedAction, updateAnkiAction } from './actions';
import { CATEGORY_LABELS, CAUSE_LABELS } from '../_shared/labels';
import { useConversionFeedback } from './ConversionFeedback';
import styles from './anki.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Una tarjeta pendiente. El boton sella `anki_added_at` con la hora del servidor.
 *
 * La `CONFUSION` se muestra como par mi-respuesta / correcta a proposito: el spec pide
 * tarjeta **de contraste** para esa causa, no una tarjeta suelta.
 */
export function QueueItem({ error, date, available }: { readonly error: ErrorRow; readonly date: string; readonly available: boolean }) {
  const [pending, startTransition] = useTransition();
  const report = useConversionFeedback();
  const meta = CAUSE_META[error.cause];

  return (
    <li className={`${styles.card} ${pending ? styles.going : ''}`}>
      <div>
        <div className={styles.meta}>
          {/* A su sesion: corregir una errata antes de crear la tarjeta. */}
          <Link className="data" href={`/registrar?s=${String(error.sessionId)}`}>
            {date}
            <span className="sr-only"> · abrir su sesión</span>
          </Link>
          <span className={meta.side === 'study' ? ui.chipStudy : ui.chipExec}>
            {CAUSE_LABELS[error.cause]}
          </span>
          <span>{CATEGORY_LABELS[error.category]}</span>
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
      {/* Sin Anki, el boton sigue enfocable (aria-disabled) para que el motivo llegue
          tambien por teclado; el aviso de encima de la cola dice que hacer. */}
      <button
        type="button"
        className={available ? ui.primary : ui.secondary}
        disabled={pending}
        aria-disabled={!available || undefined}
        aria-busy={pending}
        aria-describedby={!available ? 'anki-unavailable' : undefined}
        onClick={() => {
          if (!available) return;
          startTransition(async () => { report(await createAnkiAction(error.id)); });
        }}
      >
        {pending ? 'Creando…' : 'Crear en Anki'}
      </button>
      </div>
    </li>
  );
}

/** Solo aparece cuando la tarjeta existe y su texto ya no coincide con el error. */
export function UpdateButton({ id, available, stale }: {
  readonly id: number; readonly available: boolean; readonly stale: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const report = useConversionFeedback();
  if (!stale) return null;

  return (
    <button
      type="button"
      className={`${ui.secondary} ${ui.small}`}
      disabled={pending}
      aria-disabled={!available || undefined}
      aria-busy={pending}
      aria-describedby={!available ? 'anki-status' : undefined}
      title={available ? 'Reescribe la tarjeta con el texto actual del error.' : 'Abre Anki para poder actualizarla.'}
      onClick={() => {
        if (!available) return;
        startTransition(async () => { report(await updateAnkiAction(id)); });
      }}
    >
      {pending ? 'Actualizando…' : 'Actualizar en Anki'}
    </button>
  );
}

export function UndoButton({ id }: { readonly id: number }) {
  const [pending, startTransition] = useTransition();
  const report = useConversionFeedback();

  return (
    <button
      type="button"
      className={`${ui.secondary} ${ui.small}`}
      title="Devuelve el error a la cola. La nota de Anki se conserva."
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        startTransition(async () => { report(await undoAddedAction(id)); });
      }}
    >
      Deshacer
    </button>
  );
}
