'use client';

import { useId, useState } from 'react';
import { PAPERS, SESSION_KINDS, SOURCES, partsFor, type Paper } from '@/lib/domain/enums';
import type { ImportedSession } from '@/lib/import/errors';
import styles from './session.module.css';
import ui from '../_shared/ui.module.css';

export function SessionFields({ today, defaults, fieldErrors = {}, onTimedChange, idPrefix }: {
  readonly today: string;
  readonly defaults?: Partial<ImportedSession> & { durationMin?: number | null };
  readonly fieldErrors?: Record<string, string[]>;
  readonly onTimedChange?: (timed: boolean) => void;
  readonly idPrefix?: string;
}) {
  const generatedId = useId();
  const fieldId = idPrefix ?? generatedId;
  const [paper, setPaper] = useState<Paper | null>(defaults?.paper === undefined ? 'RUOE' : defaults.paper);
  const [kind, setKind] = useState<string>(defaults?.kind ?? 'DRILL');
  const isWriting = paper === 'WRITING';

  const errorsFor = (field: string): string[] => fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      // Sin role="alert": el resumen del formulario avisa y el foco va al campo rechazado.
      <p className={ui.fieldError} id={`${fieldId}-${field}-error`} data-field={field}>
        {messages.map((message) => <span key={message}>{message}</span>)}
      </p>
    );
  };

  return <>
        <label>
          <span className={ui.label}>Fecha</span>
          <input
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            max={today}
            required
            className="data"
            aria-invalid={invalid('date')}
            aria-describedby={invalid('date') ? `${fieldId}-date-error` : undefined}
          />
          {fieldError('date')}
        </label>

        <label>
          <span className={ui.label}>Tipo</span>
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
          <span className={ui.label}>Paper</span>
          <select
            name="paper"
            value={paper ?? ''}
            onChange={(event) => {
              const selected = PAPERS.find((value) => value === event.target.value);
              setPaper(selected ?? null);
            }}
            aria-invalid={invalid('paper')}
            aria-describedby={invalid('paper') ? `${fieldId}-paper-error` : undefined}
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
          <span className={ui.label}>Part</span>
          <select
            name="part"
            defaultValue={String(defaults?.paper === paper ? defaults.part : 1)}
            key={paper}
            aria-invalid={invalid('part')}
            aria-describedby={invalid('part') ? `${fieldId}-part-error` : undefined}
          >
            {partsFor(paper).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {fieldError('part')}
        </label>}
        {paper === null && fieldError('part')}

        <label>
          <span className={ui.label}>Fuente</span>
          <select name="source" defaultValue={defaults?.source ?? 'LIBRO'}>
            {SOURCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.wide}>
          <span className={ui.label}>Referencia</span>
          <input
            name="sourceRef"
            autoComplete="off"
            placeholder="Unidad 1, ej. 5"
            defaultValue={defaults?.sourceRef ?? ''}
          />
        </label>

        <label>
          <span className={ui.label}>Items{isWriting ? '' : ' *'}</span>
          <input
            type="number"
            name="itemsTotal"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            defaultValue={defaults?.itemsTotal ?? ''}
            aria-invalid={invalid('itemsTotal')}
            aria-describedby={invalid('itemsTotal') ? `${fieldId}-itemsTotal-error` : undefined}
          />
          {fieldError('itemsTotal')}
        </label>

        <label>
          <span className={ui.label}>Aciertos{isWriting ? '' : ' *'}</span>
          <input
            type="number"
            name="itemsCorrect"
            min={0}
            className="data"
            required={!isWriting}
            disabled={isWriting}
            defaultValue={defaults?.itemsCorrect ?? ''}
            aria-invalid={invalid('itemsCorrect')}
            aria-describedby={invalid('itemsCorrect') ? `${fieldId}-itemsCorrect-error` : undefined}
          />
          {fieldError('itemsCorrect')}
          {isWriting && <span className={ui.help}>El Writing no se mide por items.</span>}
        </label>

        <label>
          <span className={ui.label}>Minutos</span>
          <input
            type="number"
            name="durationMin"
            min={0}
            className="data"
            defaultValue={defaults?.durationMin ?? ''}
          />
        </label>

        <label className={`${ui.check} ${styles.checkCell}`}>
          <input type="checkbox" name="timed" defaultChecked={defaults?.timed ?? false} onChange={(event) => onTimedChange?.(event.target.checked)} />
          <span>Cronometrada</span>
        </label>

  </>;
}
