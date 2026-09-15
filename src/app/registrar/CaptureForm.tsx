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
 * Entrada rapida de errores, en las dos variantes que pide §6.1.
 *
 * El requisito rector del spec original manda sobre todo lo demas: **dar de alta un
 * error tiene que costar menos de 30 segundos**. De ahi salen las tres decisiones que
 * gobiernan este componente:
 *  - la causa, la categoria y la subcategoria sobreviven al envio, porque dentro de una
 *    tanda se repiten mucho;
 *  - al guardar, el foco vuelve solo al primer campo;
 *  - `secs` se mide solo. Pedirlo a mano seria cobrar el tiempo que se quiere ahorrar.
 *
 * Los campos viven en `ErrorFields`, compartidos con la edicion de una fila.
 */

export type Variant = 'grid' | 'card' | 'paste';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly lastCategory: string | null;
}

export function CaptureForm({ session, subcategorySuggestions, lastCategory }: Props) {
  const [state, formAction, pending] = useActionState(addErrorAction, EMPTY_STATE);
  const [variant, setVariant] = useState<Variant>('grid');

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
          <button
            type="button"
            className={variant === 'grid' ? styles.variantOn : styles.variantOff}
            aria-pressed={variant === 'grid'}
            onClick={() => {
              setVariant('grid');
            }}
          >
            Grid
          </button>
          <button
            type="button"
            className={variant === 'card' ? styles.variantOn : styles.variantOff}
            aria-pressed={variant === 'card'}
            onClick={() => {
              setVariant('card');
            }}
          >
            Card
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
        {variant === 'grid'
          ? ' Grid: para volcar diez errores seguidos.'
          : ' Card: un error a la vez, campos grandes.'}
      </p>

      <form
        ref={formRef}
        action={submit}
        onReset={onReset}
        className={variant === 'grid' ? styles.grid : styles.card}
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
          variant={variant === 'card' ? 'card' : 'grid'}
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
