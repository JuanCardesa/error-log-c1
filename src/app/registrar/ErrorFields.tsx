'use client';

import { type RefObject, useId, useState } from 'react';

import { CATEGORIES, CAUSES, CAUSE_META, CONFIDENCES } from '@/lib/domain/enums';
import { CATEGORY_LABELS } from '../_shared/labels';
import styles from './capture.module.css';
import ui from '../_shared/ui.module.css';

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
  readonly ruleNote?: string;
}

/** Los campos que la captura conserva de un error al siguiente. */
type CarriedField = 'cause' | 'category' | 'subcategory' | 'confidence';

interface Props {
  /** Si la sesion es cronometrada. `late_in_session` no significa nada sin cronometro. */
  readonly timed: boolean;
  readonly subcategorySuggestions: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string[]>>;
  readonly defaults?: ErrorFieldDefaults;
  readonly firstFieldRef?: RefObject<HTMLInputElement | null>;
  readonly namePrefix?: string;
  /**
   * Cuantas veces se ha guardado en este formulario sin desmontarlo. Solo lo pasa la
   * captura, que conserva causa, categoria, subcategoria y confianza entre errores: con
   * el, esos valores se marcan como heredados hasta que se tocan.
   */
  readonly carryVersion?: number;
  readonly compact?: boolean;
  readonly detailsOpen?: boolean;
  readonly onDetailsToggle?: (open: boolean) => void;
}

const isCategory = (value: string): boolean => (CATEGORIES as readonly string[]).includes(value);

export function ErrorFields({
  timed,
  subcategorySuggestions,
  fieldErrors,
  defaults,
  firstFieldRef,
  namePrefix = '',
  carryVersion,
  compact = false,
  detailsOpen,
  onDetailsToggle,
}: Props) {
  const scope = useId();

  // La captura conserva estos cuatro valores al limpiar el formulario: dentro de una
  // tanda se repiten mucho. Los selects tambien necesitan esa conservacion explicita.
  const initialCategory = defaults?.category ?? '';
  const [cause, setCause] = useState<string>(defaults?.cause ?? CAUSES[0]);
  const [category, setCategory] = useState<string>(isCategory(initialCategory) ? initialCategory : '');
  const [subcategory, setSubcategory] = useState<string>(defaults?.subcategory ?? '');
  const [confidence, setConfidence] = useState<string>(defaults?.confidence ?? 'DUDABA');

  // Un bloque pegado puede traer una categoria que no esta en la lista: no cabe en el
  // desplegable, asi que se dice que traia y se pide elegir.
  const proposedCategory = initialCategory !== '' && !isCategory(initialCategory) ? initialCategory : null;

  // Que valores conservados ha tocado el usuario desde el ultimo guardado. Se vacia al
  // cambiar `carryVersion`, sin efecto: se ajusta durante el render.
  const [edited, setEdited] = useState<ReadonlySet<CarriedField>>(new Set());
  const [seenVersion, setSeenVersion] = useState(carryVersion);
  if (seenVersion !== carryVersion) {
    setSeenVersion(carryVersion);
    setEdited(new Set());
  }
  const touch = (field: CarriedField) => {
    if (!edited.has(field)) setEdited(new Set([...edited, field]));
  };

  const carried = (field: CarriedField, value: string): boolean => {
    if (carryVersion === undefined || edited.has(field) || value === '') return false;
    // Antes del primer guardado solo la categoria viene de fuera: la ultima usada.
    return carryVersion > 0 || field === 'category';
  };

  const errorsFor = (field: string): string[] => fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const errorId = (field: string): string => `${scope}-${field}-error`;
  const carriedId = (field: CarriedField): string => `${scope}-${field}-carried`;

  // Sin `role="alert"`: tras un error el foco va al primer campo invalido, que lee su
  // mensaje por `aria-describedby`. Varias alertas a la vez solo se pisan.
  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p
        className={ui.fieldError}
        id={errorId(field)}
        // Ancla estable: el id va aislado con useId y no sirve para apuntar desde fuera.
        data-field={field}
      >
        {messages.map((message) => (
          <span key={message}>{message}</span>
        ))}
      </p>
    );
  };

  const describedBy = (...ids: (string | false)[]): string | undefined => {
    const present = ids.filter((id): id is string => id !== false);
    return present.length === 0 ? undefined : present.join(' ');
  };
  const errorRef = (field: string): string | false => invalid(field) && errorId(field);
  const carriedRef = (field: CarriedField, value: string): string | false =>
    carried(field, value) && carriedId(field);

  // Va fuera de la etiqueta para no cambiar el nombre del campo; el campo la enlaza como
  // descripcion.
  const carriedMark = (field: CarriedField, value: string) =>
    carried(field, value) ? (
      <span className={styles.carried} id={carriedId(field)}>
        {field === 'category' && carryVersion === 0 ? 'la última usada' : 'heredada'}
      </span>
    ) : null;

  const itemField = (
    <label className={styles.fItem}>
      <span className={ui.label}>Item</span>
      <input
        ref={firstFieldRef}
        name={`${namePrefix}itemRef`}
        autoComplete="off"
        className="data"
        placeholder="4"
        defaultValue={defaults?.itemRef ?? ''}
      />
    </label>
  );

  const promptField = (
    <label className={styles.fPrompt}>
      <span className={ui.label}>
        Enunciado <abbr title="obligatorio">*</abbr>
      </span>
      <input
        name={`${namePrefix}prompt`}
        autoComplete="off"
        required
        defaultValue={defaults?.prompt ?? ''}
        aria-invalid={invalid('prompt')}
        aria-describedby={describedBy(errorRef('prompt'))}
        placeholder="They had to call off the meeting. (CALLED)"
      />
      {fieldError('prompt')}
    </label>
  );

  const mineField = (
    <label className={styles.fMine}>
      <span className={ui.label}>Mi respuesta</span>
      <input
        name={`${namePrefix}myAnswer`}
        autoComplete="off"
        className="data"
        defaultValue={defaults?.myAnswer ?? ''}
      />
    </label>
  );

  const correctField = (
    <label className={styles.fCorrect}>
      <span className={ui.label}>
        Correcta <abbr title="obligatorio">*</abbr>
      </span>
      <input
        name={`${namePrefix}correctAnswer`}
        autoComplete="off"
        required
        className="data"
        defaultValue={defaults?.correctAnswer ?? ''}
        aria-invalid={invalid('correctAnswer')}
        aria-describedby={describedBy(errorRef('correctAnswer'))}
      />
      {fieldError('correctAnswer')}
    </label>
  );

  const causeField = (
    <div className={styles.fCause}>
      <div className={styles.labelRow}>
        <label className={ui.label} htmlFor={`${scope}-cause`}>
          Causa
        </label>
        {carriedMark('cause', cause)}
      </div>
      <select
        id={`${scope}-cause`}
        name={`${namePrefix}cause`}
        value={cause}
        onChange={(event) => {
          setCause(event.target.value);
          touch('cause');
        }}
        aria-describedby={describedBy(`${scope}-cause-side`, carriedRef('cause', cause))}
      >
        {CAUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <CauseChip cause={cause} id={`${scope}-cause-side`} />
    </div>
  );

  const categoryField = (
    <div className={styles.fCategory}>
      <div className={styles.labelRow}>
        <label className={ui.label} htmlFor={`${scope}-category`}>
          Categoria <abbr title="obligatorio">*</abbr>
        </label>
        {carriedMark('category', category)}
      </div>
      <select
        id={`${scope}-category`}
        name={`${namePrefix}category`}
        required
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          touch('category');
        }}
        aria-invalid={invalid('category') || (proposedCategory !== null && category === '')}
        aria-describedby={describedBy(
          errorRef('category'),
          proposedCategory !== null && category === '' && `${scope}-category-proposed`,
          carriedRef('category', category),
        )}
      >
        <option value="" disabled>
          Elige una categoría
        </option>
        {CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {CATEGORY_LABELS[value]}
          </option>
        ))}
      </select>
      {proposedCategory !== null && category === '' && (
        <span className={ui.help} id={`${scope}-category-proposed`}>
          El bloque traía «{proposedCategory}», que no está en la lista: elige una.
        </span>
      )}
      {fieldError('category')}
    </div>
  );

  const subcategoryField = (
    <div className={styles.fSubcategory}>
      <div className={styles.labelRow}>
        <label className={ui.label} htmlFor={`${scope}-subcategory`}>
          Subcategoria
        </label>
        {carriedMark('subcategory', subcategory)}
      </div>
      <input
        id={`${scope}-subcategory`}
        name={`${namePrefix}subcategory`}
        list={`${scope}-subcategories`}
        autoComplete="off"
        value={subcategory}
        onChange={(event) => {
          setSubcategory(event.target.value);
          touch('subcategory');
        }}
        aria-describedby={describedBy(carriedRef('subcategory', subcategory))}
        placeholder="-ance/-ence"
      />
      <datalist id={`${scope}-subcategories`}>
        {subcategorySuggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </div>
  );

  const confidenceField = (
    <div className={styles.fConfidence}>
      <div className={styles.labelRow}>
        <label className={ui.label} htmlFor={`${scope}-confidence`}>
          Confianza
        </label>
        {carriedMark('confidence', confidence)}
      </div>
      <select
        id={`${scope}-confidence`}
        name={`${namePrefix}confidence`}
        value={confidence}
        onChange={(event) => {
          setConfidence(event.target.value);
          touch('confidence');
        }}
        aria-describedby={describedBy(carriedRef('confidence', confidence))}
      >
        {CONFIDENCES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );

  const ruleField = (
    <label className={styles.fRule}>
      <span className={ui.label}>
        Regla, con tus palabras <abbr title="obligatorio">*</abbr>
      </span>
      <textarea
        name={`${namePrefix}ruleNote`}
        rows={2}
        required
        minLength={15}
        defaultValue={defaults?.ruleNote ?? ''}
        aria-invalid={invalid('ruleNote')}
        aria-describedby={describedBy(errorRef('ruleNote'))}
        placeholder={compact ? 'Por que es asi, con tus palabras' : "call off lleva doble f; 'of' es otra preposicion"}
      />
      {fieldError('ruleNote')}
    </label>
  );

  const flagsField = (
    <div className={styles.fFlags}>
      {/* Sin cronometro la casilla no significa nada: no se muestra. */}
      {timed && (
        <label className={ui.check}>
          <input
            type="checkbox"
            name={`${namePrefix}lateInSession`}
            defaultChecked={defaults?.lateInSession ?? false}
          />
          <span>Al final de la sesion</span>
        </label>
      )}

      {/* La conversion se sella desde Anki, no aqui. El aviso sigue haciendo falta:
          cambiar la causa de un error ya convertido tiene que poder rechazarse. */}
      {fieldError('ankiAdded')}
    </div>
  );

  if (compact) {
    const detailInvalid = ['itemRef', 'prompt', 'myAnswer', 'subcategory', 'lateInSession', 'ankiAdded'].some(invalid);
    return (
      <>
        <div className={styles.review}>
          {correctField}
          {causeField}
          {categoryField}
          {confidenceField}
          {ruleField}
        </div>
        <details className={styles.reviewMore} open={detailsOpen === true || detailInvalid}
          onToggle={(event) => { onDetailsToggle?.(event.currentTarget.open); }}>
          <summary>Item, enunciado, tu respuesta y subcategoria</summary>
          <div className={styles.reviewMoreGrid}>
            {itemField}
            {promptField}
            {mineField}
            {subcategoryField}
            {flagsField}
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      {itemField}
      {promptField}
      {mineField}
      {correctField}
      {causeField}
      {categoryField}
      {subcategoryField}
      {confidenceField}
      {ruleField}
      {flagsField}
    </>
  );
}

function CauseChip({ cause, id }: { readonly cause: string; readonly id: string }) {
  const meta = CAUSE_META[cause as keyof typeof CAUSE_META] as
    | (typeof CAUSE_META)[keyof typeof CAUSE_META]
    | undefined;
  if (meta === undefined) return null;

  return (
    <span
      id={id}
      className={`${meta.side === 'study' ? ui.chipStudy : ui.chipExec} ${styles.causeChip}`}
      title={meta.remedy}
    >
      {meta.side === 'study' ? 'estudio' : 'ejecucion'}
      {meta.generatesCard ? ' · tarjeta' : ' · sin tarjeta'}
    </span>
  );
}
