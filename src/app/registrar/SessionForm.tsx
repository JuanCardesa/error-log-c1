'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { MAX_PART, PAPERS, SESSION_KINDS, SOURCES, partsFor } from '@/lib/domain/enums';
import type { Paper } from '@/lib/domain/enums';
import { createSessionAction } from './actions';
import { EMPTY_STATE } from './formState';
import styles from './session.module.css';

/**
 * Cabecera de sesion. §6.1 pide validarla **antes** de aceptar errores y enseñar el
 * error concreto: hasta que esta no se guarda, no aparece el formulario de captura.
 *
 * El paper condiciona dos cosas en vivo: cuantas parts hay, y si los items son
 * opcionales. Solo el Writing puede quedarse sin items, porque no se mide por aciertos.
 */

interface Props {
  readonly today: string;
}

export function SessionForm({ today }: Props) {
  const [state, formAction, pending] = useActionState(createSessionAction, EMPTY_STATE);
  const [paper, setPaper] = useState<Paper>('RUOE');
  const [kind, setKind] = useState<string>('DRILL');

  const router = useRouter();
  const navigated = useRef<number | undefined>(undefined);

  // Se abre una sesion para volcar errores en ella: entrar es el siguiente paso, no
  // buscarla luego en la lista.
  useEffect(() => {
    if (!state.ok || state.createdId === undefined) return;
    if (navigated.current === state.createdId) return;
    navigated.current = state.createdId;
    router.push(`/registrar?s=${String(state.createdId)}`);
  }, [state, router]);

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
      <h2 id="session-heading">Nueva sesion</h2>
      <p className={styles.hint}>
        Una sesion es el denominador. Registrala aunque no hayas fallado nada: sin ella,
        las tasas mienten al alza.
      </p>

      <form action={formAction} className={styles.form}>
        <label>
          <span className={styles.label}>Fecha</span>
          <input
            type="date"
            name="date"
            defaultValue={today}
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
            value={paper}
            onChange={(event) => {
              setPaper(event.target.value as Paper);
            }}
            aria-invalid={invalid('paper')}
            aria-describedby={invalid('paper') ? 's-paper-error' : undefined}
          >
            {PAPERS.map((value) => (
              <option key={value} value={value} disabled={kind === 'WRITING' && value !== 'WRITING'}>
                {value}
              </option>
            ))}
          </select>
          {fieldError('paper')}
        </label>

        <label>
          <span className={styles.label}>Part</span>
          <select
            name="part"
            defaultValue="1"
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
        </label>

        <label>
          <span className={styles.label}>Fuente</span>
          <select name="source" defaultValue="LIBRO">
            {SOURCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.wide}>
          <span className={styles.label}>Referencia</span>
          <input name="sourceRef" autoComplete="off" placeholder="Unidad 1, ej. 5" />
        </label>

        <label>
          <span className={styles.label}>
            Items{isWriting ? '' : ' *'}
          </span>
          <input
            type="number"
            name="itemsTotal"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            aria-invalid={invalid('itemsTotal')}
            aria-describedby={invalid('itemsTotal') ? 's-itemsTotal-error' : undefined}
          />
          {fieldError('itemsTotal')}
        </label>

        <label>
          <span className={styles.label}>
            Aciertos{isWriting ? '' : ' *'}
          </span>
          <input
            type="number"
            name="itemsCorrect"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            aria-invalid={invalid('itemsCorrect')}
            aria-describedby={invalid('itemsCorrect') ? 's-itemsCorrect-error' : undefined}
          />
          {fieldError('itemsCorrect')}
          {isWriting && (
            <span className={styles.help}>El Writing no se mide por items.</span>
          )}
        </label>

        <label>
          <span className={styles.label}>Minutos</span>
          <input type="number" name="durationMin" min={0} className="data" />
        </label>

        <label className={styles.check}>
          <input type="checkbox" name="timed" />
          <span>Cronometrada</span>
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? 'Abriendo…' : 'Abrir sesion'}
          </button>
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
