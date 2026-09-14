'use client';

import { useState, useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow } from '@/lib/domain/types';
import { deleteErrorAction } from './actions';
import styles from './list.module.css';

/**
 * Errores ya registrados en la sesion.
 *
 * El borrado es en dos pasos, no un `confirm()`: §6 pide que no haya datos
 * irrecuperables por un clic, y un dialogo del navegador se acepta por inercia.
 */

interface Props {
  readonly errors: readonly ErrorRow[];
}

export function ErrorList({ errors }: Props) {
  if (errors.length === 0) {
    return (
      <p className={styles.empty}>
        Sin errores todavia. Una sesion de cero errores es valida y cuenta en el
        denominador: cierrala sin mas cuando termines.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">Errores registrados en esta sesion</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Correcta</th>
            <th scope="col">Causa</th>
            <th scope="col">Categoria</th>
            <th scope="col">Conf.</th>
            <th scope="col">Regla</th>
            <th scope="col">Anki</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <Row key={error.id} error={error} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ error }: { readonly error: ErrorRow }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const meta = CAUSE_META[error.cause];

  return (
    <tr className={pending ? styles.rowGoing : undefined}>
      <td className="data">{error.itemRef ?? '—'}</td>
      <td className="data">{error.correctAnswer}</td>
      <td>
        <span className={meta.side === 'study' ? styles.chipStudy : styles.chipExec}>
          {error.cause}
        </span>
      </td>
      <td className="data">
        {error.category}
        {error.subcategory !== null && (
          <span className={styles.sub}> · {error.subcategory}</span>
        )}
      </td>
      <td className="data">
        {error.confidence === 'SEGURO' ? (
          <strong className={styles.sure} title="Falsa certeza: creencia instalada">
            SEGURO
          </strong>
        ) : (
          error.confidence
        )}
      </td>
      <td className={styles.rule}>{error.ruleNote}</td>
      <td className="data">
        {meta.generatesCard ? (error.ankiAdded ? 'si' : 'pendiente') : '—'}
      </td>
      <td className={styles.rowActions}>
        {confirming ? (
          <>
            <button
              type="button"
              className={styles.danger}
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await deleteErrorAction(error.id);
                });
              }}
            >
              Borrar
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setConfirming(false);
              }}
            >
              No
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.quiet}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Borrar…
          </button>
        )}
      </td>
    </tr>
  );
}
