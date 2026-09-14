'use client';

import { useState } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import { SessionControls } from './SessionControls';
import { SessionForm } from './SessionForm';
import styles from './page.module.css';
import list from './list.module.css';

/**
 * Cabecera de una sesion abierta: los datos, los controles y la correccion en sitio.
 *
 * Corregir una sesion pasada es lo que pide §6 y hasta ahora faltaba: se podia crear,
 * cerrar, reabrir y borrar, pero no arreglar un numero mal tecleado.
 */
export function SessionPanel({
  session,
  errorCount,
  today,
}: {
  readonly session: SessionRow;
  readonly errorCount: number;
  readonly today: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SessionForm
        today={today}
        editing={session}
        onDone={() => {
          setEditing(false);
        }}
      />
    );
  }

  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Fuente</dt>
          <dd className="data">
            {session.source}
            {session.sourceRef === null ? '' : ` · ${session.sourceRef}`}
          </dd>
        </div>
        <div>
          <dt>Items</dt>
          <dd className="data">
            {session.itemsTotal === null
              ? 'no aplica'
              : `${String(session.itemsCorrect ?? 0)} / ${String(session.itemsTotal)}`}
          </dd>
        </div>
        <div>
          <dt>Cronometro</dt>
          <dd className="data">{session.timed ? 'si' : 'no'}</dd>
        </div>
        <div>
          <dt>Errores</dt>
          <dd className="data">{errorCount}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span
              className={session.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}
            >
              {session.status}
            </span>
          </dd>
        </div>
      </dl>

      <div className={list.controls}>
        <button
          type="button"
          className={list.quiet}
          onClick={() => {
            setEditing(true);
          }}
        >
          Corregir cabecera
        </button>
        <SessionControls session={session} errorCount={errorCount} />
      </div>
    </>
  );
}
