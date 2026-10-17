'use client';

import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';

import { PAPERS, SESSION_KINDS, SOURCES, partsFor, type Paper } from '@/lib/domain/enums';
import type { ImportedSession } from '@/lib/import/errors';
import { useT } from '../_shared/i18nClient';
import styles from './session.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Campos de la cabecera de una sesión, en tres grupos (Práctica, Resultado y Origen) y
 * el tiempo como opcional. Los `name` son el contrato con las acciones de servidor.
 *
 * Tipo Writing obliga a paper Writing; al revés no: hay simulacros y clases de Writing.
 * Writing no registra ítems ni aciertos: sus campos no se muestran ni se envían.
 */
export function SessionFields({ today, defaults, fieldErrors = {}, onTimedChange, idPrefix }: {
  readonly today: string;
  readonly defaults?: Partial<ImportedSession> & { durationMin?: number | null };
  readonly fieldErrors?: Record<string, string[]>;
  readonly onTimedChange?: (timed: boolean) => void;
  readonly idPrefix?: string;
}) {
  const t = useT();
  const generatedId = useId();
  const fieldId = idPrefix ?? generatedId;
  const [paper, setPaper] = useState<Paper | null>(defaults?.paper === undefined ? 'RUOE' : defaults.paper);
  const [kind, setKind] = useState<string>(defaults?.kind ?? 'DRILL');
  const isWriting = paper === 'WRITING';

  const errorsFor = (field: string): string[] => fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const describedBy = (field: string): string | undefined => (invalid(field) ? `${fieldId}-${field}-error` : undefined);

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p className={ui.fieldError} id={`${fieldId}-${field}-error`} data-field={field}>
        {messages.map((message) => <span key={message}>{message}</span>)}
      </p>
    );
  };

  const hasTime = (defaults?.durationMin ?? null) !== null || defaults?.timed === true || invalid('durationMin');

  return (
    <div className={styles.groups}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t.sessionForm.practice}</span>
        <div className={styles.grid2}>
          <div className={ui.field}>
            <label htmlFor={`${fieldId}-f1`}>{t.sessionForm.date}</label>
            <input id={`${fieldId}-f1`}
              type="date"
              name="date"
              defaultValue={defaults?.date ?? today}
              max={today}
              required
              className={ui.input}
              aria-invalid={invalid('date')}
              aria-describedby={describedBy('date')}
            />
            {fieldError('date')}
          </div>

          <div className={ui.field}>
            <label htmlFor={`${fieldId}-f2`}>{t.sessionForm.kind}</label>
            <select id={`${fieldId}-f2`}
              name="kind"
              className={ui.select}
              value={kind}
              onChange={(event) => {
                const next = event.target.value;
                setKind(next);
                // kind = WRITING obliga a paper = WRITING (implicación, decisión P4).
                if (next === 'WRITING') setPaper('WRITING');
              }}
            >
              {SESSION_KINDS.map((value) => (
                <option key={value} value={value}>{t.labels.kind[value]}</option>
              ))}
            </select>
          </div>

          <div className={ui.field}>
            <label htmlFor={`${fieldId}-f3`}>{t.sessionForm.examFormat}</label>
            <select id={`${fieldId}-f3`}
              name="paper"
              className={ui.select}
              value={paper ?? ''}
              onChange={(event) => {
                const selected = PAPERS.find((value) => value === event.target.value);
                setPaper(selected ?? null);
              }}
              aria-invalid={invalid('paper')}
              aria-describedby={describedBy('paper')}
            >
              <option value="" disabled={kind === 'WRITING'}>{t.format.noExamFormat}</option>
              {PAPERS.map((value) => (
                <option key={value} value={value} disabled={kind === 'WRITING' && value !== 'WRITING'}>
                  {t.labels.paperLong[value]}
                </option>
              ))}
            </select>
            {fieldError('paper')}
          </div>

          {paper !== null && (
            <div className={ui.field}>
              <label htmlFor={`${fieldId}-f4`}>{t.sessionForm.part}</label>
              <select id={`${fieldId}-f4`}
                name="part"
                className={ui.select}
                defaultValue={String(defaults?.paper === paper ? defaults.part : 1)}
                key={paper}
                aria-invalid={invalid('part')}
                aria-describedby={describedBy('part')}
              >
                {partsFor(paper).map((value) => (
                  <option key={value} value={value}>{t.format.part(value)}</option>
                ))}
              </select>
              {fieldError('part')}
            </div>
          )}
          {paper === null && fieldError('part')}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t.sessionForm.result}</span>
        {isWriting ? (
          <p className={styles.groupNote}>
            {t.sessionForm.writingNote}
          </p>
        ) : (
          <div className={styles.groupStack}>
            <div className={styles.grid2}>
              <div className={ui.field}>
                <label htmlFor={`${fieldId}-f5`}>{t.sessionForm.itemsAttempted}</label>
                <input id={`${fieldId}-f5`}
                  type="number"
                  name="itemsTotal"
                  min={0}
                  required
                  className={ui.input}
                  defaultValue={defaults?.itemsTotal ?? ''}
                  aria-invalid={invalid('itemsTotal')}
                  aria-describedby={describedBy('itemsTotal')}
                />
                {fieldError('itemsTotal')}
              </div>
              <div className={ui.field}>
                <label htmlFor={`${fieldId}-f6`}>{t.sessionForm.correct}</label>
                <input id={`${fieldId}-f6`}
                  type="number"
                  name="itemsCorrect"
                  min={0}
                  required
                  className={ui.input}
                  defaultValue={defaults?.itemsCorrect ?? ''}
                  aria-invalid={invalid('itemsCorrect')}
                  aria-describedby={describedBy('itemsCorrect')}
                />
                {fieldError('itemsCorrect')}
              </div>
            </div>
            <span className={ui.help}>{t.sessionForm.perfectHelp}</span>
          </div>
        )}
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t.sessionForm.origin}</span>
        <div className={styles.gridOrigin}>
          <div className={ui.field}>
            <label htmlFor={`${fieldId}-f7`}>{t.sessionForm.source}</label>
            <select id={`${fieldId}-f7`} name="source" className={ui.select} defaultValue={defaults?.source ?? 'LIBRO'}>
              {SOURCES.map((value) => (
                <option key={value} value={value}>{t.labels.source[value]}</option>
              ))}
            </select>
          </div>
          <div className={ui.field}>
            <label htmlFor={`${fieldId}-f8`}><span>{t.sessionForm.reference} <span className={ui.optional}>{t.common.optional}</span></span></label>
            <input id={`${fieldId}-f8`}
              name="sourceRef"
              autoComplete="off"
              className={ui.input}
              placeholder={t.sessionForm.referencePlaceholder}
              defaultValue={defaults?.sourceRef ?? ''}
            />
          </div>
        </div>
      </div>

      <details className={`${ui.disclosure} ${styles.timeGroup}`} open={hasTime || undefined}>
        <summary>
          <ChevronRight size={14} className="chevron" aria-hidden="true" />
          <span className={styles.summaryStrong}>{t.sessionForm.timeAndDuration}</span>
          <span className={ui.optional}>{t.common.optional}</span>
        </summary>
        <div className={styles.timeFields}>
          <div className={`${ui.field} ${styles.duration}`}>
            <label htmlFor={`${fieldId}-f9`}>{t.sessionForm.durationMin}</label>
            <input id={`${fieldId}-f9`}
              type="number"
              name="durationMin"
              min={0}
              className={ui.input}
              defaultValue={defaults?.durationMin ?? ''}
              aria-invalid={invalid('durationMin')}
              aria-describedby={describedBy('durationMin')}
            />
            {fieldError('durationMin')}
          </div>
          <label className={ui.check}>
            <input
              type="checkbox"
              name="timed"
              defaultChecked={defaults?.timed ?? false}
              onChange={(event) => onTimedChange?.(event.target.checked)}
            />
            {t.sessionForm.timed}
          </label>
        </div>
      </details>
    </div>
  );
}
