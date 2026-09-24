'use client';

import { ChevronRight } from 'lucide-react';
import { type RefObject, useId, useState } from 'react';

import { CATEGORIES, CAUSES, CAUSE_META, CONFIDENCES, type Cause } from '@/lib/domain/enums';
import { RULE_NOTE_MIN_LENGTH } from '@/lib/validation/schemas';
import { CATEGORY_LABELS, CAUSE_LABELS, CONFIDENCE_LABELS } from '../_shared/labels';
import styles from './capture.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Los campos de un error, compartidos por la captura y la edición en el panel. Aquí y no
 * duplicados para que no puedan divergir: si cambia un enum o una validación, cambia en
 * un sitio. Los `name` son el contrato con las acciones de servidor.
 *
 * - `capture`: rejilla ancha. Ítem y enunciado; tu respuesta y corrección; categoría,
 *   causa y confianza; regla; «Más detalles» con subcategoría y final de sesión.
 * - `panel`: una columna estrecha para editar dentro del detalle.
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

const CARRIED_LABELS: Readonly<Record<CarriedField, string>> = {
  category: 'categoría',
  cause: 'causa',
  confidence: 'confianza',
  subcategory: 'subcategoría',
};

interface Props {
  /** Si la sesión es cronometrada. `late_in_session` no significa nada sin cronómetro. */
  readonly timed: boolean;
  readonly subcategorySuggestions: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string[]>>;
  readonly defaults?: ErrorFieldDefaults;
  readonly firstFieldRef?: RefObject<HTMLInputElement | null>;
  /**
   * Cuántas veces se ha guardado sin desmontar el formulario. Solo la pasa la captura,
   * que conserva causa, categoría, subcategoría y confianza entre errores: con él, esos
   * valores se marcan como heredados hasta que se tocan.
   */
  readonly carryVersion?: number;
  readonly layout?: 'capture' | 'panel';
}

const isCategory = (value: string): boolean => (CATEGORIES as readonly string[]).includes(value);
const isCause = (value: string): value is Cause => (CAUSES as readonly string[]).includes(value);

export function ErrorFields({
  timed,
  subcategorySuggestions,
  fieldErrors,
  defaults,
  firstFieldRef,
  carryVersion,
  layout = 'capture',
}: Props) {
  const scope = useId();

  const initialCategory = defaults?.category ?? '';
  const [cause, setCause] = useState<string>(defaults?.cause ?? CAUSES[0]);
  const [category, setCategory] = useState<string>(isCategory(initialCategory) ? initialCategory : '');
  const [subcategory, setSubcategory] = useState<string>(defaults?.subcategory ?? '');
  const [confidence, setConfidence] = useState<string>(defaults?.confidence ?? 'DUDABA');
  const [ruleLength, setRuleLength] = useState((defaults?.ruleNote ?? '').trim().length);

  // Una fila pegada puede traer una categoría que no está en la lista.
  const proposedCategory = initialCategory !== '' && !isCategory(initialCategory) ? initialCategory : null;

  // Qué valores conservados ha tocado el usuario desde el último guardado. Se vacía al
  // cambiar `carryVersion`, sin efecto: se ajusta durante el render.
  const [edited, setEdited] = useState<ReadonlySet<CarriedField>>(new Set());
  const [seenVersion, setSeenVersion] = useState(carryVersion);
  if (seenVersion !== carryVersion) {
    setSeenVersion(carryVersion);
    setEdited(new Set());
    // Tras guardar, la captura vacía la regla: el contador vuelve a empezar.
    setRuleLength(0);
  }
  const touch = (field: CarriedField) => {
    if (!edited.has(field)) setEdited(new Set([...edited, field]));
  };

  const values: Readonly<Record<CarriedField, string>> = { cause, category, subcategory, confidence };
  const carried = (field: CarriedField): boolean => {
    if (carryVersion === undefined || edited.has(field) || values[field] === '') return false;
    // Antes del primer guardado solo la categoría viene de fuera: la última usada.
    return carryVersion > 0 || field === 'category';
  };
  const carriedFields = (['category', 'cause', 'confidence', 'subcategory'] as const).filter(carried);
  const carriedId = `${scope}-carried`;

  const errorsFor = (field: string): string[] => fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const errorId = (field: string): string => `${scope}-${field}-error`;

  // Sin `role="alert"`: el foco va al primer campo inválido, que lee su mensaje.
  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p className={ui.fieldError} id={errorId(field)} data-field={field}>
        {messages.map((message) => <span key={message}>{message}</span>)}
      </p>
    );
  };

  const describedBy = (...ids: (string | false)[]): string | undefined => {
    const present = ids.filter((id): id is string => id !== false);
    return present.length === 0 ? undefined : present.join(' ');
  };
  const errorRef = (field: string): string | false => invalid(field) && errorId(field);
  const carriedRef = (field: CarriedField): string | false => carried(field) && carriedId;

  const causeMeta = isCause(cause) ? CAUSE_META[cause] : null;
  const detailInvalid = ['itemRef', 'subcategory', 'lateInSession'].some(invalid);

  const itemField = (
    <div className={`${ui.field} ${styles.fItem}`}>
      <label htmlFor={`${scope}-f1`}>Ítem</label>
      <input id={`${scope}-f1`}
        ref={firstFieldRef}
        name="itemRef"
        autoComplete="off"
        className={ui.input}
        placeholder="4"
        defaultValue={defaults?.itemRef ?? ''}
      />
    </div>
  );

  const promptField = (
    <div className={`${ui.field} ${styles.fPrompt}`}>
      <label htmlFor={`${scope}-prompt`}>Enunciado</label>
      {layout === 'panel' ? (
        <textarea
          id={`${scope}-prompt`}
          name="prompt"
          rows={2}
          required
          className={ui.textarea}
          defaultValue={defaults?.prompt ?? ''}
          aria-invalid={invalid('prompt')}
          aria-describedby={describedBy(errorRef('prompt'))}
        />
      ) : (
        <input
          id={`${scope}-prompt`}
          name="prompt"
          autoComplete="off"
          required
          className={ui.input}
          defaultValue={defaults?.prompt ?? ''}
          aria-invalid={invalid('prompt')}
          aria-describedby={describedBy(errorRef('prompt'))}
          placeholder="Frase o contexto del ítem"
        />
      )}
      {fieldError('prompt')}
    </div>
  );

  const mineField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f2`}><span>Tu respuesta <span className={ui.optional}>· opcional</span></span></label>
      <input id={`${scope}-f2`} name="myAnswer" autoComplete="off" className={ui.input} defaultValue={defaults?.myAnswer ?? ''} />
    </div>
  );

  const correctField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f3`}>Corrección</label>
      <input id={`${scope}-f3`}
        name="correctAnswer"
        autoComplete="off"
        required
        className={ui.input}
        defaultValue={defaults?.correctAnswer ?? ''}
        aria-invalid={invalid('correctAnswer')}
        aria-describedby={describedBy(errorRef('correctAnswer'))}
      />
      {fieldError('correctAnswer')}
    </div>
  );

  const categoryField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f4`}>Categoría</label>
      <select id={`${scope}-f4`}
        name="category"
        required
        className={ui.select}
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          touch('category');
        }}
        aria-invalid={invalid('category') || (proposedCategory !== null && category === '')}
        aria-describedby={describedBy(
          errorRef('category'),
          proposedCategory !== null && category === '' && `${scope}-category-proposed`,
          carriedRef('category'),
        )}
      >
        <option value="" disabled>Elegir…</option>
        {CATEGORIES.map((value) => (
          <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
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

  const causeField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f5`}>Causa</label>
      <select id={`${scope}-f5`}
        name="cause"
        className={ui.select}
        value={cause}
        onChange={(event) => {
          setCause(event.target.value);
          touch('cause');
        }}
        aria-describedby={describedBy(`${scope}-cause-help`, carriedRef('cause'))}
      >
        {CAUSES.map((value) => (
          <option key={value} value={value}>{CAUSE_LABELS[value]}</option>
        ))}
      </select>
    </div>
  );

  const confidenceField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f6`}>Confianza</label>
      <select id={`${scope}-f6`}
        name="confidence"
        className={ui.select}
        value={confidence}
        onChange={(event) => {
          setConfidence(event.target.value);
          touch('confidence');
        }}
        aria-describedby={describedBy(carriedRef('confidence'))}
      >
        {CONFIDENCES.map((value) => (
          <option key={value} value={value}>{CONFIDENCE_LABELS[value]}</option>
        ))}
      </select>
    </div>
  );

  const causeHelp = causeMeta === null ? null : (
    <span id={`${scope}-cause-help`} className={`${ui.helpInfo} ${styles.causeHelp}`}>
      {causeMeta.meaning}. {causeMeta.generatesCard ? 'Generará una tarjeta pendiente en Anki.' : 'No genera tarjeta.'}
    </span>
  );

  const ruleField = (
    <div className={`${ui.field} ${styles.fRule}`}>
      <label htmlFor={`${scope}-rule`}>Regla</label>
      <textarea
        id={`${scope}-rule`}
        name="ruleNote"
        rows={layout === 'panel' ? 3 : 2}
        required
        minLength={RULE_NOTE_MIN_LENGTH}
        className={ui.textarea}
        defaultValue={defaults?.ruleNote ?? ''}
        onChange={(event) => { setRuleLength(event.target.value.trim().length); }}
        aria-invalid={invalid('ruleNote')}
        aria-describedby={describedBy(errorRef('ruleNote'), `${scope}-rule-count`)}
        placeholder="Qué debes recordar (mín. 15 caracteres, distinta de la respuesta)"
      />
      <span id={`${scope}-rule-count`} className={ruleLength >= RULE_NOTE_MIN_LENGTH ? ui.help : ui.helpWarn}>
        {ruleLength >= RULE_NOTE_MIN_LENGTH
          ? `${String(ruleLength)} caracteres`
          : `Faltan ${String(RULE_NOTE_MIN_LENGTH - ruleLength)} caracteres (mínimo ${String(RULE_NOTE_MIN_LENGTH)})`}
      </span>
      {fieldError('ruleNote')}
    </div>
  );

  const subcategoryField = (
    <div className={ui.field}>
      <label htmlFor={`${scope}-f7`}><span>Subcategoría <span className={ui.optional}>· opcional</span></span></label>
      <input id={`${scope}-f7`}
        name="subcategory"
        list={`${scope}-subcategories`}
        autoComplete="off"
        className={ui.input}
        value={subcategory}
        onChange={(event) => {
          setSubcategory(event.target.value);
          touch('subcategory');
        }}
        aria-describedby={describedBy(carriedRef('subcategory'))}
        placeholder="-ance/-ence"
      />
      <datalist id={`${scope}-subcategories`}>
        {subcategorySuggestions.map((value) => <option key={value} value={value} />)}
      </datalist>
    </div>
  );

  // Sin cronómetro la casilla no significa nada: no se muestra.
  const lateField = timed ? (
    <label className={ui.check}>
      <input type="checkbox" name="lateInSession" defaultChecked={defaults?.lateInSession ?? false} />
      Al final de la sesión
    </label>
  ) : null;

  const carriedNote = carriedFields.length === 0 ? null : (
    <span id={carriedId} className={`${ui.help} ${styles.carriedNote}`}>
      {carryVersion === 0 && carriedFields.length === 1 && carriedFields[0] === 'category'
        ? 'Categoría: la última usada.'
        : `${capitalize(joinList(carriedFields.map((field) => CARRIED_LABELS[field])))} ${carriedFields.length === 1 ? 'heredada' : 'heredadas'} del error anterior.`}
    </span>
  );

  if (layout === 'panel') {
    return (
      <div className={styles.panelFields}>
        {promptField}
        <div className={styles.pair}>
          {mineField}
          {correctField}
        </div>
        {ruleField}
        <div className={styles.pair}>
          {categoryField}
          {causeField}
        </div>
        {causeHelp}
        <div className={styles.pair}>
          {confidenceField}
          {itemField}
        </div>
        {subcategoryField}
        {lateField}
        {/* La conversión se sella desde Anki. El aviso sigue haciendo falta: cambiar la
            causa de un error ya convertido tiene que poder rechazarse. */}
        {fieldError('ankiAdded')}
      </div>
    );
  }

  return (
    <div className={styles.captureFields}>
      <div className={styles.rowItem}>
        {itemField}
        {promptField}
      </div>
      <div className={styles.rowPair}>
        {mineField}
        {correctField}
      </div>
      <div className={styles.rowTriple}>
        {categoryField}
        {causeField}
        {confidenceField}
      </div>
      {(carriedNote !== null || causeHelp !== null) && (
        <div className={styles.notes}>
          {carriedNote}
          {causeHelp}
        </div>
      )}
      {ruleField}
      <details className={ui.disclosure} open={detailInvalid || undefined}>
        <summary>
          <ChevronRight size={14} className="chevron" aria-hidden="true" />
          Más detalles <span className={ui.optional}>· subcategoría{timed ? ', al final de la sesión' : ''}</span>
        </summary>
        <div className={styles.moreFields}>
          {subcategoryField}
          {lateField}
        </div>
      </details>
      {fieldError('ankiAdded')}
    </div>
  );
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
