'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow, SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { deleteErrorAction, updateErrorAction } from './actions';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import capture from './capture.module.css';
import styles from './list.module.css';

/**
 * Errores ya registrados en la sesion, con correccion en linea.
 *
 * El borrado es en dos pasos, no un `confirm()`: §6 pide que no haya datos
 * irrecuperables por un clic, y un dialogo del navegador se acepta por inercia.
 */

interface Props {
  readonly errors: readonly ErrorRow[];
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
}

export function ErrorList({ errors, session, subcategorySuggestions }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);

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
          {errors.map((error) =>
            editingId === error.id ? (
              <EditRow
                key={error.id}
                error={error}
                session={session}
                subcategorySuggestions={subcategorySuggestions}
                onDone={() => {
                  setEditingId(null);
                }}
              />
            ) : (
              <Row
                key={error.id}
                error={error}
                onEdit={() => {
                  setEditingId(error.id);
                }}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ error, onEdit }: { readonly error: ErrorRow; readonly onEdit: () => void }) {
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
          <>
            <button type="button" className={styles.quiet} onClick={onEdit}>
              Editar
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Borrar…
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * La fila se sustituye por el formulario en su sitio, sin sacar a nadie de la pagina:
 * corregir un error es mirar la lista y arreglar lo que chirria.
 */
function EditRow({
  error,
  session,
  subcategorySuggestions,
  onDone,
}: {
  readonly error: ErrorRow;
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateErrorAction, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <tr>
      <td colSpan={8} className={styles.editCell}>
        <form ref={formRef} action={formAction} onReset={onReset} className={capture.grid}>
          <input type="hidden" name="id" value={error.id} />
          <input type="hidden" name="sessionId" value={error.sessionId} />
          {/* Conserva el `secs` que midieron las versiones anteriores; ya no se captura. */}
          <input type="hidden" name="secs" value={error.secs ?? 0} />
          {/* Sin esto, corregir un error convertido lo desvincularia de su nota de Anki. */}
          {error.ankiAdded && <input type="hidden" name="ankiAdded" value="on" />}

          <ErrorFields
            timed={session.timed}
            subcategorySuggestions={subcategorySuggestions}
            fieldErrors={state.fieldErrors}
            defaults={error}
          />

          <div className={capture.fSubmit}>
            <button type="submit" className={capture.primary} disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className={styles.quiet} onClick={onDone}>
              Cancelar
            </button>
          </div>
        </form>
        {state.message !== null && !state.ok && (
          <p role="alert" className={capture.fieldError}>{state.message}</p>
        )}
      </td>
    </tr>
  );
}
