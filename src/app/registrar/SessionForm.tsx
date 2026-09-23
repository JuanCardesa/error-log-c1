'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';

import { SessionFields } from './SessionFields';
import type { SessionRow } from '@/lib/domain/types';
import type { ImportedSession } from '@/lib/import/errors';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { createSessionAction, updateSessionAction } from './actions';
import { EMPTY_STATE } from './formState';
import styles from './session.module.css';
import ui from '../_shared/ui.module.css';

/** Alta y edición comparten campos y validación. */

interface Props {
  readonly today: string;
  /** Sesion a corregir. `null` para abrir una nueva. */
  readonly editing?: SessionRow | null;
  readonly onDone?: () => void;
  /** Solo al abrir una nueva: valores de partida (p. ej. Writing al venir de /writing). */
  readonly preset?: Partial<ImportedSession>;
  /** Solo al abrir una nueva: a donde ir tras crearla, en vez de entrar en ella. */
  readonly returnTo?: string;
}

export function SessionForm({ today, editing = null, onDone, preset, returnTo }: Props) {
  const isEdit = editing !== null;
  const { formRef, onReset } = usePreservedForm();
  const [state, formAction, pending] = useActionState(
    isEdit ? updateSessionAction : createSessionAction,
    EMPTY_STATE,
  );

  const router = useRouter();
  const handled = useRef<number | undefined>(undefined);

  // Rechazada: el foco va al primer campo que el servidor ha marcado.
  useEffect(() => {
    if (!state.ok) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, formRef]);

  useEffect(() => {
    if (!state.ok || state.createdId === undefined) return;
    if (handled.current === state.createdId) return;
    handled.current = state.createdId;

    if (isEdit) {
      onDone?.();
      return;
    }
    // Se abre una sesion para volcar errores en ella: entrar es el siguiente paso, no
    // buscarla luego en la lista.
    router.push(returnTo ?? `/registrar?s=${String(state.createdId)}`);
  }, [state, router, isEdit, onDone, returnTo]);

  return (
    <section className={ui.panel} aria-labelledby="session-heading">
      <h2 id="session-heading">
        {isEdit ? `Corregir sesion #${String(editing.id)}` : 'Nueva sesion'}
      </h2>
      <p className={ui.hint}>
        {isEdit
          ? 'Corregir la cabecera no toca los errores ya registrados. Pasa por la misma validacion que el alta.'
          : 'Una sesion es el denominador. Registrala aunque no hayas fallado nada: sin ella, las tasas mienten al alza.'}
      </p>

      <form ref={formRef} action={formAction} onReset={onReset} className={styles.form}>
        {isEdit && (
          <>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="status" value={editing.status} />
          </>
        )}

        <SessionFields today={today} defaults={editing ?? preset} fieldErrors={state.fieldErrors} idPrefix="s" />

        <div className={styles.actions}>
          <button type="submit" className={`${ui.primary} ${styles.submit}`} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cabecera' : 'Abrir sesion'}
          </button>
          {isEdit && (
            <button type="button" className={ui.secondary} onClick={onDone}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {state.message !== null && (
        <p
          className={state.ok ? ui.noticeOk : ui.noticeError}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
