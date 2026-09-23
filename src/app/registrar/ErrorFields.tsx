'use client';

import { type RefObject, useId, useState } from 'react';

import { CATEGORIES, CAUSES, CAUSE_META, CONFIDENCES } from '@/lib/domain/enums';
import styles from './capture.module.css';

/**
 * Los campos de un error, compartidos por el alta y la edicion.
 *
 * Estan aqui y no duplicados en cada formulario para que no puedan divergir: si mañana
 * cambia un enum o una validacion, cambia en un sitio.
 *
 * Los ids van aislados con `useId` porque puede haber varios formularios montados a la
 * vez —el de alta arriba y el de edicion de una fila— y dos `<datalist id="...">`
 * iguales se pisarian.
 */

export interface ErrorFieldDefaults {
  readonly itemRef?: string | null;
  readonly prompt?: string;
  readonly myAnswer?: string | null;
  readonly correctAnswer?: string;
  readonly cause?: string;
  readonly category?: string;
  readonly subcategory?: string | null;
  readonly confidence?: string;
  readonly lateInSession?: boolean;
  readonly ankiAdded?: boolean;
  readonly ruleNote?: string;
}

interface Props {
  /** Si la sesion es cronometrada. `late_in_session` no significa nada sin cronometro. */
  readonly timed: boolean;
  readonly subcategorySuggestions: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string[]>>;
  readonly defaults?: ErrorFieldDefaults;
  readonly firstFieldRef?: RefObject<HTMLInputElement | null>;
  readonly namePrefix?: string;
}

export function ErrorFields({
  timed,
  subcategorySuggestions,
  fieldErrors,
  defaults,
  firstFieldRef,
  namePrefix = '',
}: Props) {
  const scope = useId();

  // La captura conserva estos cuatro valores al limpiar el formulario: dentro de una
  // tanda se repiten mucho. Los selects tambien necesitan esa conservacion explicita.
  const [cause, setCause] = useState<string>(defaults?.cause ?? CAUSES[0]);
  const [category, setCategory] = useState<string>(defaults?.category ?? '');
  const [subcategory, setSubcategory] = useState<string>(defaults?.subcategory ?? '');
  const [confidence, setConfidence] = useState<string>(defaults?.confidence ?? 'DUDABA');

  const errorsFor = (field: string): string[] => fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const errorId = (field: string): string => `${scope}-${field}-error`;

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p
        className={styles.fieldError}
        id={errorId(field)}
        // Ancla estable: el id va aislado con useId y no sirve para apuntar desde fuera.
        data-field={field}
        role="alert"
      >
        {messages.join(' ')}
      </p>
    );
  };

  const describedBy = (field: string): string | undefined =>
    invalid(field) ? errorId(field) : undefined;

  return (
    <>
      <label className={styles.fItem}>
        <span className={styles.label}>Item</span>
        <input
          ref={firstFieldRef}
          name={`${namePrefix}itemRef`}
          autoComplete="off"
          className="data"
          placeholder="4"
          defaultValue={defaults?.itemRef ?? ''}
        />
      </label>

      <label className={styles.fPrompt}>
        <span className={styles.label}>
          Enunciado <abbr title="obligatorio">*</abbr>
        </span>
        <input
          name={`${namePrefix}prompt`}
          autoComplete="off"
          required
          defaultValue={defaults?.prompt ?? ''}
          aria-invalid={invalid('prompt')}
          aria-describedby={describedBy('prompt')}
          placeholder="They had to call off the meeting. (CALLED)"
        />
        {fieldError('prompt')}
      </label>

      <label className={styles.fMine}>
        <span className={styles.label}>Mi respuesta</span>
        <input
          name={`${namePrefix}myAnswer`}
          autoComplete="off"
          className="data"
          defaultValue={defaults?.myAnswer ?? ''}
        />
      </label>

      <label className={styles.fCorrect}>
        <span className={styles.label}>
          Correcta <abbr title="obligatorio">*</abbr>
        </span>
        <input
          name={`${namePrefix}correctAnswer`}
          autoComplete="off"
          required
          className="data"
          defaultValue={defaults?.correctAnswer ?? ''}
          aria-invalid={invalid('correctAnswer')}
          aria-describedby={describedBy('correctAnswer')}
        />
        {fieldError('correctAnswer')}
      </label>

      <label className={styles.fCause}>
        <span className={styles.label}>Causa</span>
        <select
          name={`${namePrefix}cause`}
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
          name={`${namePrefix}category`}
          list={`${scope}-categories`}
          autoComplete="off"
          required
          value={category}
          onChange={(event) => {
            setCategory(event.target.value.toUpperCase());
          }}
          aria-invalid={invalid('category')}
          aria-describedby={describedBy('category')}
        />
        <datalist id={`${scope}-categories`}>
          {CATEGORIES.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        {fieldError('category')}
      </label>

      <label className={styles.fSubcategory}>
        <span className={styles.label}>Subcategoria</span>
        <input
          name={`${namePrefix}subcategory`}
          list={`${scope}-subcategories`}
          autoComplete="off"
          value={subcategory}
          onChange={(event) => {
            setSubcategory(event.target.value);
          }}
          placeholder="-ance/-ence"
        />
        <datalist id={`${scope}-subcategories`}>
          {subcategorySuggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>

      <label className={styles.fConfidence}>
        <span className={styles.label}>Confianza</span>
        <select
          name={`${namePrefix}confidence`}
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
          name={`${namePrefix}ruleNote`}
          rows={2}
          required
          minLength={15}
          defaultValue={defaults?.ruleNote ?? ''}
          aria-invalid={invalid('ruleNote')}
          aria-describedby={describedBy('ruleNote')}
          placeholder="call off lleva doble f; 'of' es otra preposicion"
        />
        {fieldError('ruleNote')}
      </label>

      <div className={styles.fFlags}>
        <label className={styles.check}>
          <input
            type="checkbox"
            name={`${namePrefix}lateInSession`}
            disabled={!timed}
            defaultChecked={defaults?.lateInSession ?? false}
            aria-describedby={timed ? undefined : `${scope}-late-help`}
          />
          <span>Al final de la sesion</span>
        </label>
        {!timed && (
          <span className={styles.help} id={`${scope}-late-help`}>
            Solo con cronometro: sin el, el dato no significa nada.
          </span>
        )}

        {/* La conversion se sella desde Anki, no aqui. El aviso sigue haciendo falta:
            cambiar la causa de un error ya convertido tiene que poder rechazarse. */}
        {fieldError('ankiAdded')}
      </div>
    </>
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
      {meta.side === 'study' ? 'estudio' : 'ejecucion'}
      {meta.generatesCard ? ' · tarjeta' : ' · sin tarjeta'}
    </span>
  );
}
