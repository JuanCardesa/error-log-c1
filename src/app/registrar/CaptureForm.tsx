'use client';

import { Check } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import { Kbd } from '../_shared/Kbd';
import { useShortcutLabels } from '../_shared/shortcuts';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { addErrorAction } from './actions';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import styles from './capture.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Captura de errores uno a uno. Conserva categoría, causa, subcategoría y confianza entre
 * errores y devuelve el foco al ítem al guardar. Intro en un campo de una línea guarda;
 * en la regla, Ctrl/⌘+Intro.
 */

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly lastCategory: string | null;
  readonly onClose: () => void;
  /** Oculta pero montada: lo escrito sigue ahí al volver. */
  readonly visible?: boolean;
}

export function CaptureForm({ session, subcategorySuggestions, lastCategory, onClose, visible = true }: Props) {
  const [state, formAction, pending] = useActionState(addErrorAction, EMPTY_STATE);
  const keys = useShortcutLabels();

  const { formRef, onReset, resetForm } = usePreservedForm();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lastCreated = useRef<number | undefined>(undefined);

  // Guardados en esta tanda: con ellos los campos conservados se marcan como heredados.
  const [saves, setSaves] = useState(0);
  const [countedId, setCountedId] = useState<number | undefined>(undefined);
  if (state.ok && state.createdId !== undefined && state.createdId !== countedId) {
    setCountedId(state.createdId);
    setSaves(saves + 1);
  }

  // Al abrirla (o volver a ella), el cursor empieza en el ítem.
  useEffect(() => {
    if (visible) firstFieldRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!state.ok) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (state.createdId === undefined || lastCreated.current === state.createdId) return;
    lastCreated.current = state.createdId;
    // Se vacía lo que cambia de un error a otro y se conservan los valores de la tanda.
    resetForm(['cause', 'category', 'subcategory', 'confidence']);
    firstFieldRef.current?.focus();
  }, [state, resetForm, formRef]);

  return (
    <section id="captura" className={`${ui.surface} ${styles.block}`} aria-labelledby="capture-heading" hidden={!visible}>
      <div className={styles.blockHead}>
        <h3 id="capture-heading" className={styles.blockTitle}>Añadir error</h3>
        <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={onClose}>Terminar</button>
      </div>

      <form
        ref={formRef}
        action={formAction}
        onReset={onReset}
        className={styles.form}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target instanceof HTMLTextAreaElement) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <input type="hidden" name="sessionId" value={session.id} />

        <ErrorFields
          timed={session.timed}
          subcategorySuggestions={subcategorySuggestions}
          fieldErrors={state.fieldErrors}
          defaults={{ category: lastCategory ?? '' }}
          firstFieldRef={firstFieldRef}
          carryVersion={saves}
        />

        <div className={styles.submitRow}>
          <span aria-live="polite" className={styles.saved}>
            {state.ok && state.createdId !== undefined && !pending && (
              <><Check size={16} aria-hidden="true" />Error guardado</>
            )}
          </span>
          <span className={ui.help}>
            <Kbd>{keys.enter}</Kbd> guarda · en la regla, <Kbd>{keys.save}</Kbd>
          </span>
          <button type="submit" className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : 'Guardar y seguir'}
          </button>
        </div>
      </form>

      {state.message !== null && !state.ok && (
        <p role="alert" className={ui.fieldError}>{state.message}</p>
      )}
    </section>
  );
}
