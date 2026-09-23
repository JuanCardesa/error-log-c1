'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import type { ErrorRow, SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { deleteErrorAction, updateErrorAction } from './actions';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import capture from './capture.module.css';
import styles from './list.module.css';
import ui from '../_shared/ui.module.css';

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
  // Al cerrar una edicion, el foco vuelve al boton Editar de esa fila y no al principio.
  const [returnTo, setReturnTo] = useState<number | null>(null);

  if (errors.length === 0) {
    return (
      <p className={`${ui.empty} ${styles.empty}`}>
        Sin errores todavia. Una sesion de cero errores es valida y cuenta en el
        denominador: cierrala sin mas cuando termines.
      </p>
    );
  }

  return (
    <div className={`${ui.tableWrap} ${ui.framed} ${styles.wrap}`}>
      <table className={`${ui.table} ${styles.table}`}>
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
                  setReturnTo(error.id);
                }}
              />
            ) : (
              <Row
                key={error.id}
                error={error}
                focusEdit={returnTo === error.id}
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

function Row({ error, focusEdit, onEdit }: {
  readonly error: ErrorRow;
  readonly focusEdit: boolean;
  readonly onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const editRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // La fila se vuelve a montar al salir de la edicion: es entonces cuando recupera el foco.
  useEffect(() => {
    if (focusEdit) editRef.current?.focus();
  }, [focusEdit]);

  // Al pedir confirmacion, el foco va a la opcion segura; al cancelar, vuelve a «Borrar…».
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) askRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const meta = CAUSE_META[error.cause];

  return (
    <tr className={pending ? styles.rowGoing : undefined}>
      <td className="data">{error.itemRef ?? '—'}</td>
      <td className="data">{error.correctAnswer}</td>
      <td>
        <span className={meta.side === 'study' ? ui.chipStudy : ui.chipExec}>
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
      <td
        className={styles.rowActions}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && confirming) setConfirming(false);
        }}
      >
        {confirming ? (
          <>
            <button
              type="button"
              className={`${ui.danger} ${ui.small}`}
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
              ref={keepRef}
              type="button"
              className={`${ui.secondary} ${ui.small}`}
              onClick={() => {
                setConfirming(false);
              }}
            >
              No
            </button>
          </>
        ) : (
          <>
            <button ref={editRef} type="button" className={`${ui.secondary} ${ui.small}`} onClick={onEdit}>
              Editar
            </button>
            <button
              ref={askRef}
              type="button"
              className={`${ui.secondary} ${ui.small}`}
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
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Editar es para cambiar algo: el cursor empieza dentro del formulario.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  // Rechazado: al primer campo que el servidor ha marcado. Solo con cada respuesta, no
  // con cada render de la lista, para no quitar el cursor a quien esta escribiendo.
  useEffect(() => {
    if (!state.ok) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, formRef]);

  return (
    <tr>
      <td colSpan={8} className={styles.editCell}>
        <form
          ref={formRef}
          action={formAction}
          onReset={onReset}
          className={capture.grid}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onDone();
            }
          }}
        >
          <input type="hidden" name="id" value={error.id} />
          <input type="hidden" name="sessionId" value={error.sessionId} />
          {/* Referencia y cambio, nada mas: la conversion a Anki y el `secs` de las
              versiones anteriores los conserva el servidor leyendo la fila. */}

          <ErrorFields
            timed={session.timed}
            subcategorySuggestions={subcategorySuggestions}
            fieldErrors={state.fieldErrors}
            defaults={error}
            firstFieldRef={firstFieldRef}
          />

          <div className={capture.fSubmit}>
            <button type="submit" className={ui.primary} disabled={pending} aria-busy={pending}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className={`${ui.secondary} ${ui.small}`} onClick={onDone}>
              Cancelar
            </button>
          </div>
        </form>
        {state.message !== null && !state.ok && (
          <p role="alert" className={ui.fieldError}>{state.message}</p>
        )}
      </td>
    </tr>
  );
}
