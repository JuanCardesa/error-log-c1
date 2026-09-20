'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { MAX_PART, PAPERS, SESSION_KINDS, SOURCES, partsFor } from '@/lib/domain/enums';
import type { Paper } from '@/lib/domain/enums';
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

  const [paper, setPaper] = useState<Paper | null>(editing === null ? 'RUOE' : editing.paper);
  const [kind, setKind] = useState<string>(editing?.kind ?? 'DRILL');

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

  const isWriting = paper === 'WRITING';

  const errorsFor = (field: string): string[] => state.fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p className={styles.fieldError} id={`s-${field}-error`} role="alert">
        {messages.join(' ')}
      </p>
    );
  };

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

        <label>
          <span className={styles.label}>Fecha</span>
          <input
            type="date"
            name="date"
            defaultValue={editing?.date ?? today}
            max={today}
            required
            className="data"
            aria-invalid={invalid('date')}
            aria-describedby={invalid('date') ? 's-date-error' : undefined}
          />
          {fieldError('date')}
        </label>

        <label>
          <span className={styles.label}>Tipo</span>
          <select
            name="kind"
            value={kind}
            onChange={(event) => {
              const next = event.target.value;
              setKind(next);
              // kind = WRITING obliga a paper = WRITING (implicacion, decision P4).
              if (next === 'WRITING') setPaper('WRITING');
            }}
          >
            {SESSION_KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={styles.label}>Paper</span>
          <select
            name="paper"
            value={paper ?? ''}
            onChange={(event) => {
              const selected = PAPERS.find((value) => value === event.target.value);
              setPaper(selected ?? null);
            }}
            aria-invalid={invalid('paper')}
            aria-describedby={invalid('paper') ? 's-paper-error' : undefined}
          >
            <option value="" disabled={kind === 'WRITING'}>Sin formato de examen</option>
            {PAPERS.map((value) => (
              <option
                key={value}
                value={value}
                disabled={kind === 'WRITING' && value !== 'WRITING'}
              >
                {value}
              </option>
            ))}
          </select>
          {fieldError('paper')}
        </label>

        {paper !== null && <label>
          <span className={styles.label}>Part</span>
          <select
            name="part"
            defaultValue={String(editing?.paper === paper ? editing.part : 1)}
            key={paper}
            aria-invalid={invalid('part')}
            aria-describedby={invalid('part') ? 's-part-error' : undefined}
          >
            {partsFor(paper).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className={styles.help}>
            {paper} llega a {MAX_PART[paper]}
          </span>
          {fieldError('part')}
        </label>}
        {paper === null && fieldError('part')}

        <label>
          <span className={styles.label}>Fuente</span>
          <select name="source" defaultValue={editing?.source ?? 'LIBRO'}>
            {SOURCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.wide}>
          <span className={styles.label}>Referencia</span>
          <input
            name="sourceRef"
            autoComplete="off"
            placeholder="Unidad 1, ej. 5"
            defaultValue={editing?.sourceRef ?? ''}
          />
        </label>

        <label>
          <span className={styles.label}>Items{isWriting ? '' : ' *'}</span>
          <input
            type="number"
            name="itemsTotal"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            defaultValue={editing?.itemsTotal ?? ''}
            aria-invalid={invalid('itemsTotal')}
            aria-describedby={invalid('itemsTotal') ? 's-itemsTotal-error' : undefined}
          />
          {fieldError('itemsTotal')}
        </label>

        <label>
          <span className={styles.label}>Aciertos{isWriting ? '' : ' *'}</span>
          <input
            type="number"
            name="itemsCorrect"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            defaultValue={editing?.itemsCorrect ?? ''}
            aria-invalid={invalid('itemsCorrect')}
            aria-describedby={invalid('itemsCorrect') ? 's-itemsCorrect-error' : undefined}
          />
          {fieldError('itemsCorrect')}
          {isWriting && <span className={styles.help}>El Writing no se mide por items.</span>}
        </label>

        <label>
          <span className={styles.label}>Minutos</span>
          <input
            type="number"
            name="durationMin"
            min={0}
            className="data"
            defaultValue={editing?.durationMin ?? ''}
          />
        </label>

        <label className={styles.check}>
          <input type="checkbox" name="timed" defaultChecked={editing?.timed ?? false} />
          <span>Cronometrada</span>
        </label>

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
