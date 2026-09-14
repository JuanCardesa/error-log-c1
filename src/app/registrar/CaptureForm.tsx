'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { CATEGORIES, CAUSES, CAUSE_META, CONFIDENCES } from '@/lib/domain/enums';
import type { SessionRow } from '@/lib/domain/types';
import { addErrorAction } from './actions';
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
 */

export type Variant = 'grid' | 'card';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly lastCategory: string | null;
}

export function CaptureForm({ session, subcategorySuggestions, lastCategory }: Props) {
  const [state, formAction, pending] = useActionState(addErrorAction, EMPTY_STATE);
  const [variant, setVariant] = useState<Variant>('grid');

  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // Arranca en 0 y se fija al montar: leer el reloj en el render es impuro.
  const startedAt = useRef<number>(0);
  const lastCreated = useRef<number | undefined>(undefined);

  // Defaults agresivos: se mantienen entre altas y solo se tocan si cambian.
  const [cause, setCause] = useState<string>(CAUSES[0]);
  const [category, setCategory] = useState<string>(lastCategory ?? '');
  const [subcategory, setSubcategory] = useState<string>('');
  const [confidence, setConfidence] = useState<string>('DUDABA');

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!state.ok || state.createdId === undefined) return;
    if (lastCreated.current === state.createdId) return;
    lastCreated.current = state.createdId;

    // Se vacia lo que cambia error a error; lo que se repite se queda.
    formRef.current?.reset();
    startedAt.current = Date.now();
    firstFieldRef.current?.focus();
  }, [state]);

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

  const errorsFor = (field: string): string[] => state.fieldErrors[field] ?? [];

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p className={styles.fieldError} id={`${field}-error`} role="alert">
        {messages.join(' ')}
      </p>
    );
  };

  const invalid = (field: string): boolean => errorsFor(field).length > 0;

  return (
    <section className={styles.capture} aria-labelledby="capture-heading">
      <div className={styles.captureHead}>
        <h2 id="capture-heading">Añadir error</h2>

        <div
          className={styles.variantSwitch}
          role="group"
          aria-label="Modo de entrada"
        >
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
        </div>
      </div>

      <p className={styles.hint}>
        <kbd>Tab</kbd> entre campos, <kbd>Enter</kbd> para guardar y seguir.
        {variant === 'grid'
          ? ' Grid: para volcar diez errores seguidos.'
          : ' Card: un error a la vez, campos grandes.'}
      </p>

      <form
        ref={formRef}
        action={submit}
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

        <label className={styles.fItem}>
          <span className={styles.label}>Item</span>
          <input
            ref={firstFieldRef}
            name="itemRef"
            autoComplete="off"
            className="data"
            placeholder="4"
          />
        </label>

        <label className={styles.fPrompt}>
          <span className={styles.label}>
            Enunciado <abbr title="obligatorio">*</abbr>
          </span>
          <input
            name="prompt"
            autoComplete="off"
            required
            aria-invalid={invalid('prompt')}
            aria-describedby={invalid('prompt') ? 'prompt-error' : undefined}
            placeholder="They had to call off the meeting. (CALLED)"
          />
          {fieldError('prompt')}
        </label>

        <label className={styles.fMine}>
          <span className={styles.label}>Mi respuesta</span>
          <input name="myAnswer" autoComplete="off" className="data" />
        </label>

        <label className={styles.fCorrect}>
          <span className={styles.label}>
            Correcta <abbr title="obligatorio">*</abbr>
          </span>
          <input
            name="correctAnswer"
            autoComplete="off"
            required
            className="data"
            aria-invalid={invalid('correctAnswer')}
            aria-describedby={invalid('correctAnswer') ? 'correctAnswer-error' : undefined}
          />
          {fieldError('correctAnswer')}
        </label>

        <label className={styles.fCause}>
          <span className={styles.label}>Causa</span>
          <select
            name="cause"
            value={cause}
            onChange={(event) => {
              setCause(event.target.value);
            }}
          >
            {CAUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <CauseChip cause={cause} />
        </label>

        <label className={styles.fCategory}>
          <span className={styles.label}>
            Categoria <abbr title="obligatorio">*</abbr>
          </span>
          <input
            name="category"
            list="category-options"
            autoComplete="off"
            required
            value={category}
            onChange={(event) => {
              setCategory(event.target.value.toUpperCase());
            }}
            aria-invalid={invalid('category')}
            aria-describedby={invalid('category') ? 'category-error' : undefined}
          />
          <datalist id="category-options">
            {CATEGORIES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {fieldError('category')}
        </label>

        <label className={styles.fSubcategory}>
          <span className={styles.label}>Subcategoria</span>
          <input
            name="subcategory"
            list="subcategory-options"
            autoComplete="off"
            value={subcategory}
            onChange={(event) => {
              setSubcategory(event.target.value);
            }}
            placeholder="-ance/-ence"
          />
          <datalist id="subcategory-options">
            {subcategorySuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>

        <label className={styles.fConfidence}>
          <span className={styles.label}>Confianza</span>
          <select
            name="confidence"
            value={confidence}
            onChange={(event) => {
              setConfidence(event.target.value);
            }}
          >
            {CONFIDENCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fRule}>
          <span className={styles.label}>
            Regla, con tus palabras <abbr title="obligatorio">*</abbr>
          </span>
          <textarea
            name="ruleNote"
            rows={variant === 'card' ? 4 : 2}
            required
            minLength={15}
            aria-invalid={invalid('ruleNote')}
            aria-describedby={invalid('ruleNote') ? 'ruleNote-error' : undefined}
            placeholder="call off lleva doble f; 'of' es otra preposicion"
          />
          {fieldError('ruleNote')}
        </label>

        <div className={styles.fFlags}>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="lateInSession"
              disabled={!session.timed}
              aria-describedby={session.timed ? undefined : 'late-help'}
            />
            <span>Al final de la sesion</span>
          </label>
          {!session.timed && (
            <span className={styles.help} id="late-help">
              Solo con cronometro: sin el, el dato no significa nada.
            </span>
          )}

          <label className={styles.check}>
            <input
              type="checkbox"
              name="ankiAdded"
              aria-invalid={invalid('ankiAdded')}
              aria-describedby={invalid('ankiAdded') ? 'ankiAdded-error' : undefined}
            />
            <span>Ya es tarjeta</span>
          </label>
          {fieldError('ankiAdded')}
        </div>

        <div className={styles.fSubmit}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar y seguir'}
          </button>
        </div>
      </form>

      <p aria-live="polite" className="sr-only">
        {state.ok && state.createdId !== undefined ? 'Error registrado.' : ''}
      </p>
    </section>
  );
}

function CauseChip({ cause }: { readonly cause: string }) {
  const meta = CAUSE_META[cause as keyof typeof CAUSE_META] as
    | (typeof CAUSE_META)[keyof typeof CAUSE_META]
    | undefined;
  if (meta === undefined) return null;

  return (
    <span
      className={meta.side === 'study' ? styles.chipStudy : styles.chipExec}
      title={meta.remedy}
    >
      {meta.side}
      {meta.generatesCard ? ' · tarjeta' : ' · sin tarjeta'}
    </span>
  );
}
