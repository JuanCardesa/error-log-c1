'use client';

import { useState, useTransition } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import { deleteSessionAction, setSessionStatusAction } from './actions';
import styles from './list.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Cerrar, reabrir y borrar una sesion. Cerrar no es destructivo —solo deja de aceptar
 * errores—, asi que va directo; borrar arrastra en cascada los errores, asi que pide
 * confirmacion aparte.
 */

interface Props {
  readonly session: SessionRow;
  readonly errorCount: number;
}

export function SessionControls({ session, errorCount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const closed = session.status === 'CLOSED';

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={`${ui.secondary} ${ui.small}`}
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await setSessionStatusAction(session.id, closed ? 'OPEN' : 'CLOSED');
          });
        }}
      >
        {closed ? 'Reabrir sesion' : 'Cerrar sesion'}
      </button>

      {confirming ? (
        <>
          <span className={styles.warn}>
            Se borran tambien sus {errorCount} error{errorCount === 1 ? '' : 'es'}.
          </span>
          <button
            type="button"
            className={`${ui.danger} ${ui.small}`}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await deleteSessionAction(session.id);
              });
            }}
          >
            Borrar de todos modos
          </button>
          <button
            type="button"
            className={`${ui.secondary} ${ui.small}`}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`${ui.secondary} ${ui.small}`}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Borrar sesion…
        </button>
      )}
    </div>
  );
}
