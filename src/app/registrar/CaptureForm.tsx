'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { addErrorAction } from './actions';
import { BulkImport } from './BulkImport';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import styles from './capture.module.css';

/**
 * Conserva los valores de la tanda y devuelve el foco al guardar.
 *
 * Un unico formulario, que el CSS ya adapta al ancho disponible. Pegar una tanda es otra
 * cosa y por eso sigue separado; elegir entre dos presentaciones del mismo formulario no
 * lo era.
 */

export type Variant = 'form' | 'paste';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly lastCategory: string | null;
}

export function CaptureForm({ session, subcategorySuggestions, lastCategory }: Props) {
  const [state, formAction, pending] = useActionState(addErrorAction, EMPTY_STATE);
  const [variant, setVariant] = useState<Variant>('form');

  const { formRef, onReset, resetForm } = usePreservedForm();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // Arranca en 0 y se fija al montar: leer el reloj en el render es impuro.
  const startedAt = useRef<number>(0);
  const lastCreated = useRef<number | undefined>(undefined);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!state.ok || state.createdId === undefined) return;
    if (lastCreated.current === state.createdId) return;
    lastCreated.current = state.createdId;

    // Se vacia lo que cambia error a error y se conservan los valores de la tanda.
    resetForm(['cause', 'category', 'subcategory', 'confidence']);
    startedAt.current = Date.now();
    firstFieldRef.current?.focus();
  }, [state, resetForm]);

  /**
   * `secs` se calcula aqui, sobre el payload, y no con un input oculto: asi el valor es
   * el del momento del envio y no el del ultimo render.
   */
  const submit = (payload: FormData): void => {
    const elapsed =
      startedAt.current === 0 ? 0 : Math.round((Date.now() - startedAt.current) / 1000);
    payload.set('secs', String(elapsed));
    formAction(payload);
  };

  return (
    <section className={styles.capture} aria-labelledby="capture-heading">
      <div className={styles.captureHead}>
        <h2 id="capture-heading">Añadir error</h2>

        <div className={styles.variantSwitch} role="group" aria-label="Modo de entrada">
          <button type="button" className={variant === 'form' ? styles.variantOn : styles.variantOff}
            aria-pressed={variant === 'form'} onClick={() => { setVariant('form'); }}>
            Uno a uno
          </button>
          <button type="button" className={variant === 'paste' ? styles.variantOn : styles.variantOff}
            aria-pressed={variant === 'paste'} onClick={() => { setVariant('paste'); }}>
            Pegar varios errores
          </button>
        </div>
      </div>

      <div hidden={variant === 'paste'}>
      <p className={styles.hint}>
        <kbd>Tab</kbd> entre campos, <kbd>Enter</kbd> para guardar y seguir.
      </p>

      <form
        ref={formRef}
        action={submit}
        onReset={onReset}
        className={styles.grid}
        onKeyDown={(event) => {
          // En el textarea, Enter hace salto de linea; Ctrl+Enter guarda.
          if (
            event.key === 'Enter' &&
            (event.ctrlKey || event.metaKey) &&
            event.target instanceof HTMLTextAreaElement
          ) {
            event.preventDefault();
            formRef.current?.requestSubmit();
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
        />

        <div className={styles.fSubmit}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar y seguir'}
          </button>
        </div>
      </form>

      {state.message !== null && !state.ok && (
        <p role="alert" className={styles.fieldError}>{state.message}</p>
      )}

      <p aria-live="polite" className="sr-only">
        {state.ok && state.createdId !== undefined ? 'Error registrado.' : ''}
      </p>
      </div>
      <div hidden={variant !== 'paste'}>
        <BulkImport session={session} subcategorySuggestions={subcategorySuggestions} />
      </div>
    </section>
  );
}
