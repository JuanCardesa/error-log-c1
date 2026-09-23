'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import { CAUSE_META } from '@/lib/domain/enums';
import { CATEGORY_LABELS, CAUSE_LABELS, CONFIDENCE_LABELS } from '../_shared/labels';
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
        Sin errores todavía. Una sesión de cero errores es válida y cuenta en el
        denominador: ciérrala sin más cuando termines.
      </p>
    );
  }

  return (
    <div className={`${ui.tableWrap} ${ui.framed} ${styles.wrap}`}>
      {/* Roles explicitos: en estrecho la tabla pasa a tarjetas con display: block, y sin
          ellos algunos lectores dejan de exponerla como tabla y de anunciar las cabeceras. */}
      <table role="table" className={`${ui.table} ${styles.table}`}>
        <caption className="sr-only">Errores registrados en esta sesión</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Ítem</th>
            <th role="columnheader" scope="col">Correcta</th>
            <th role="columnheader" scope="col">Causa</th>
            <th role="columnheader" scope="col">Categoría</th>
            <th role="columnheader" scope="col">Conf.</th>
            <th role="columnheader" scope="col">Regla</th>
            <th role="columnheader" scope="col">Anki</th>
            <th role="columnheader" scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
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
    <tr role="row" className={pending ? styles.rowGoing : undefined}>
      <td role="cell" className="data" data-label="Ítem">{error.itemRef ?? '—'}</td>
      <td role="cell" className="data" data-label="Correcta">{error.correctAnswer}</td>
      <td role="cell" data-label="Causa">
        <span className={meta.side === 'study' ? ui.chipStudy : ui.chipExec}>
          {CAUSE_LABELS[error.cause]}
        </span>
      </td>
      <td role="cell" data-label="Categoría">
        {CATEGORY_LABELS[error.category]}
        {error.subcategory !== null && (
          <span className={styles.sub}> · {error.subcategory}</span>
        )}
      </td>
      <td role="cell" data-label="Confianza">
        {error.confidence === 'SEGURO' ? (
          <strong className={styles.sure} title="Falsa certeza: creencia instalada">
            {CONFIDENCE_LABELS.SEGURO}
          </strong>
        ) : (
          CONFIDENCE_LABELS[error.confidence]
        )}
      </td>
      <td role="cell" className={styles.rule} data-label="Regla">{error.ruleNote}</td>
      <td role="cell" className="data" data-label="Anki">
        {meta.generatesCard ? (error.ankiAdded ? 'sí' : 'pendiente') : '—'}
      </td>
      <td
        role="cell"
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
    <tr role="row">
      <td role="cell" colSpan={8} className={styles.editCell}>
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
