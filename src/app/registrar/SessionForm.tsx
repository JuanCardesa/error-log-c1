'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';

import { SessionFields } from './SessionFields';
import type { SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { createSessionAction, updateSessionAction } from './actions';
import { EMPTY_STATE } from './formState';
import styles from './session.module.css';

/**
 * Cabecera de sesion, para abrirla y para corregirla despues.
 *
 * §6.1 pide validarla **antes** de aceptar errores y enseñar el error concreto: hasta
 * que esta no se guarda, no aparece el formulario de captura. Corregir una sesion pasada
 * pasa por la misma validacion, porque las reglas no cambian por ser una correccion.
 *
 * El paper condiciona dos cosas en vivo: cuantas parts hay, y si los items son
 * opcionales. Solo el Writing puede quedarse sin items, porque no se mide por aciertos.
 */

interface Props {
  readonly today: string;
  /** Sesion a corregir. `null` para abrir una nueva. */
  readonly editing?: SessionRow | null;
  readonly onDone?: () => void;
}

export function SessionForm({ today, editing = null, onDone }: Props) {
  const isEdit = editing !== null;
  const { formRef, onReset } = usePreservedForm();
  const [state, formAction, pending] = useActionState(
    isEdit ? updateSessionAction : createSessionAction,
    EMPTY_STATE,
  );

  const router = useRouter();
  const handled = useRef<number | undefined>(undefined);

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
    router.push(`/registrar?s=${String(state.createdId)}`);
  }, [state, router, isEdit, onDone]);

  return (
    <section className={styles.panel} aria-labelledby="session-heading">
      <h2 id="session-heading">
        {isEdit ? `Corregir sesion #${String(editing.id)}` : 'Nueva sesion'}
      </h2>
      <p className={styles.hint}>
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

        <SessionFields today={today} defaults={editing ?? undefined} fieldErrors={state.fieldErrors} idPrefix="s" />

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cabecera' : 'Abrir sesion'}
          </button>
          {isEdit && (
            <button type="button" className={styles.secondary} onClick={onDone}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {state.message !== null && (
        <p
          className={state.ok ? styles.ok : styles.formError}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
