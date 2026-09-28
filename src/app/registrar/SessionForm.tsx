'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import type { ImportedSession } from '@/lib/import/errors';
import { Drawer } from '../_shared/Drawer';
import { useToast } from '../_shared/Toast';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { createSessionAction, updateSessionAction } from './actions';
import { EMPTY_STATE } from './formState';
import { SessionFields } from './SessionFields';
import styles from './session.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Alta y edición de una sesión en el drawer. Comparten campos y validación.
 *
 * Crear lleva a la sesión nueva, con la captura abierta: registrar errores es el paso
 * siguiente. Editar no toca sus errores. El drawer se queda montado al cerrarlo: lo
 * escrito no se pierde por cerrarlo sin querer.
 */
export function SessionDrawer({ open, onClose, today, editing = null, preset, returnTo }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly today: string;
  /** Sesión a editar. `null` para abrir una nueva. */
  readonly editing?: SessionRow | null;
  /** Solo al abrir una nueva: valores de partida (p. ej. Writing al venir de /writing). */
  readonly preset?: Partial<ImportedSession>;
  /** Solo al abrir una nueva: a dónde ir tras crearla. `{id}` se sustituye por la nueva. */
  readonly returnTo?: string;
}) {
  const isEdit = editing !== null;
  const formId = useId();
  const { formRef, onReset } = usePreservedForm();
  const [state, formAction, pending] = useActionState(isEdit ? updateSessionAction : createSessionAction, EMPTY_STATE);
  const router = useRouter();
  const toast = useToast();
  const handled = useRef<typeof state | null>(null);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (!state.ok) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (state.createdId === undefined) return;
    if (isEdit) {
      toast({ message: 'Sesión actualizada · sus errores no cambian' });
      onClose();
      return;
    }
    toast({ message: 'Sesión creada. Añade errores o ciérrala si fue perfecta' });
    const id = String(state.createdId);
    router.push(returnTo === undefined ? `/registrar?s=${id}&modo=captura` : returnTo.replace('{id}', id));
  }, [state, isEdit, onClose, router, toast, returnTo, formRef]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar sesión' : 'Nueva sesión'}
      keepMounted
      footer={(
        <>
          <button type="button" className={ui.ghost} onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="submit" form={formId} className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear sesión'}
          </button>
        </>
      )}
    >
      <form id={formId} ref={formRef} action={formAction} onReset={onReset} className={styles.form}>
        {isEdit && (
          <>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="status" value={editing.status} />
            <p className={styles.editNote}>Editar la sesión no modifica sus errores.</p>
          </>
        )}
        <SessionFields today={today} defaults={editing ?? preset} fieldErrors={state.fieldErrors} idPrefix={formId} />
        {state.message !== null && !state.ok && (
          <p role="alert" className={ui.fieldError}>{state.message}</p>
        )}
      </form>
    </Drawer>
  );
}
