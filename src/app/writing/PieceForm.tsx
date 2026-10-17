'use client';

import { ChevronRight, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { CORRECTORS, GENRES, WRITING_STATUSES } from '@/lib/domain/enums';
import type { SessionRow } from '@/lib/domain/types';
import type { WritingRow } from '@/lib/db/writingRepo';
import { Drawer } from '../_shared/Drawer';
import { mediumDate, sessionTitle } from '../_shared/format';
import { useT } from '../_shared/i18nClient';
import { useToast } from '../_shared/Toast';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { EMPTY_STATE } from '../registrar/formState';
import session from '../registrar/session.module.css';
import ui from '../_shared/ui.module.css';
import { saveWritingPieceAction } from './actions';
import { BANDS } from './bands';
import styles from './writing.module.css';

/**
 * Edición de los datos de un texto de Writing en el drawer: fecha, tipo, evaluación,
 * reescritura y duración. Las redacciones nuevas entran por la importación, con su texto.
 * Las bandas vacías se guardan como «Sin evaluar», no como cero.
 */

export interface PieceOption {
  readonly id: number;
  readonly label: string;
}

export type WritingEditablePiece = Pick<WritingRow,
  | 'id' | 'sessionId' | 'date' | 'genre' | 'status' | 'correctedOn' | 'teacherComment' | 'personalNotes'
  | 'wordCount' | 'minutes' | 'timed' | 'rewriteOf' | 'corrector'
  | 'bandContent' | 'bandCommunicative' | 'bandOrganisation' | 'bandLanguage' | 'updatedAt'
>;

export function WritingDrawer({ open, onClose, originals, editing, editingSession, transcribed, today }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly originals: readonly PieceOption[];
  readonly editing: WritingEditablePiece;
  readonly editingSession: SessionRow | null;
  /** Con transcripción, las palabras se cuentan solas y no se editan. */
  readonly transcribed: boolean;
  readonly today: string;
}) {
  const t = useT();
  const formId = useId();
  const [state, formAction, pending] = useActionState(saveWritingPieceAction, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();
  const toast = useToast();
  const handled = useRef<typeof state | null>(null);
  const [isRewrite, setIsRewrite] = useState(editing.rewriteOf !== null);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast({ message: t.writing.updated });
      onClose();
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, onClose, toast, formRef, t]);

  const errorsFor = (field: string): string[] => state.fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const errorId = (field: string): string => `${formId}-${field}-error`;
  const describedBy = (field: string): string | undefined => (invalid(field) ? errorId(field) : undefined);
  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return <p className={ui.fieldError} id={errorId(field)}>{messages.map((message) => <span key={message}>{message}</span>)}</p>;
  };
  const evaluated = editing.corrector !== null || editing.correctedOn !== null
    || editing.teacherComment !== null || editing.personalNotes !== null
    || BANDS.some((band) => editing[band.name] !== null);
  const evaluationInvalid = BANDS.some((band) => invalid(band.name));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t.writing.editWriting}
      footer={(
        <>
          <button type="button" className={ui.ghost} onClick={onClose} disabled={pending}>{t.common.cancel}</button>
          <button type="submit" form={formId} className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? t.common.saving : t.common.saveChanges}
          </button>
        </>
      )}
    >
      <form id={formId} ref={formRef} action={formAction} onReset={onReset} className={session.form}>
        <input type="hidden" name="id" value={editing.id} />
        {/* La versión que se abrió: si otra pestaña guarda antes, el servidor lo rechaza. */}
        <input type="hidden" name="updatedAt" value={editing.updatedAt} />

        <div className={session.group}>
          <span className={session.groupLabel}>{t.errors.session}</span>
          <div className={session.groupStack}>
            <input type="hidden" name="sessionId" value={editing.sessionId} />
            <p className={styles.fixedSession}>
              {editingSession === null ? t.writing.sessionNumber(editing.sessionId) : `${mediumDate(editingSession.date, t)} · ${sessionTitle(editingSession, t)}`}
            </p>
            {fieldError('sessionId')}
            <span className={ui.help}>{t.writing.sessionFixed}</span>
          </div>
        </div>

        <div className={styles.drawerGroups}>
          <div className={session.group}>
            <span className={session.groupLabel}>{t.writing.text}</span>
            <div className={session.grid2}>
              <div className={ui.field}>
                <label htmlFor={`${formId}-f2`}>{t.sessionForm.date}</label>
                <input id={`${formId}-f2`}
                  type="date"
                  name="date"
                  required
                  max={today}
                  className={ui.input}
                  defaultValue={editing.date}
                  aria-invalid={invalid('date')}
                  aria-describedby={describedBy('date')}
                />
                {fieldError('date')}
              </div>
              <div className={ui.field}>
                <label htmlFor={`${formId}-f3`}>{t.writing.genre}</label>
                <select id={`${formId}-f3`} name="genre" className={ui.select} defaultValue={editing.genre}>
                  {GENRES.map((value) => <option key={value} value={value}>{t.labels.genre[value]}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={ui.field}>
            <label htmlFor={`${formId}-status`}>{t.writing.statusFilter}</label>
            <select id={`${formId}-status`} name="status" className={ui.select} defaultValue={editing.status}>
              {WRITING_STATUSES.map((value) => <option key={value} value={value}>{t.labels.writingStatus[value]}</option>)}
            </select>
          </div>

          <details className={`${ui.disclosure} ${session.timeGroup}`} open={evaluated || evaluationInvalid || undefined}>
            <summary>
              <ChevronRight size={14} className="chevron" aria-hidden="true" />
              <span className={session.summaryStrong}>{t.writing.addAssessment}</span>
              <span className={ui.optional}>{t.writing.ifMarked}</span>
            </summary>
            <div className={styles.evaluation}>
              <div className={`${ui.field} ${styles.corrector}`}>
                <label htmlFor={`${formId}-f4`}>{t.writing.corrector}</label>
                <select id={`${formId}-f4`} name="corrector" className={ui.select} defaultValue={editing.corrector ?? ''}>
                  <option value="">{t.writing.notMarked}</option>
                  {CORRECTORS.map((value) => <option key={value} value={value}>{t.labels.corrector[value]}</option>)}
                </select>
              </div>
              <div className={ui.field}>
                <label htmlFor={`${formId}-corrected-on`}>{t.writingImport.field.correctedOn}</label>
                <input id={`${formId}-corrected-on`} type="date" name="correctedOn" max={today} className={ui.input}
                  defaultValue={editing.correctedOn ?? ''} aria-invalid={invalid('correctedOn')} aria-describedby={describedBy('correctedOn')} />
                {fieldError('correctedOn')}
              </div>
              <div className={session.grid2}>
                {BANDS.map((band) => (
                  <label key={band.name} className={ui.field}>
                    {band.label}
                    <input
                      type="number"
                      name={band.name}
                      min={0}
                      max={5}
                      step={0.5}
                      placeholder="0–5"
                      className={ui.input}
                      defaultValue={editing[band.name] ?? ''}
                      aria-invalid={invalid(band.name)}
                      aria-describedby={describedBy(band.name)}
                    />
                    {fieldError(band.name)}
                  </label>
                ))}
              </div>
              <div className={ui.field}>
                <label htmlFor={`${formId}-teacher-comment`}>{t.writingImport.teacherComment}</label>
                <textarea id={`${formId}-teacher-comment`} name="teacherComment" maxLength={5000} className={ui.input}
                  defaultValue={editing.teacherComment ?? ''} aria-invalid={invalid('teacherComment')} aria-describedby={describedBy('teacherComment')} />
                {fieldError('teacherComment')}
              </div>
              <div className={ui.field}>
                <label htmlFor={`${formId}-personal-notes`}>{t.writingImport.field.personalNotes}</label>
                <textarea id={`${formId}-personal-notes`} name="personalNotes" maxLength={5000} className={ui.input}
                  defaultValue={editing.personalNotes ?? ''} aria-invalid={invalid('personalNotes')} aria-describedby={describedBy('personalNotes')} />
                {fieldError('personalNotes')}
              </div>
              <span className={ui.help}>{t.writing.emptyBands}</span>
            </div>
          </details>

          <div className={`${session.timeGroup} ${styles.rewrite}`}>
            <label className={ui.check}>
              <input type="checkbox" checked={isRewrite} onChange={(event) => { setIsRewrite(event.target.checked); }} />
              {t.writing.isRewrite}
            </label>
            {isRewrite && (
              <div className={ui.field}>
                <label htmlFor={`${formId}-f5`}>{t.writing.original}</label>
                <select id={`${formId}-f5`}
                  name="rewriteOf"
                  className={ui.select}
                  defaultValue={editing.rewriteOf ?? ''}
                  aria-invalid={invalid('rewriteOf')}
                  aria-describedby={describedBy('rewriteOf')}
                >
                  <option value="">{t.writing.chooseOriginal}</option>
                  {originals.filter((piece) => piece.id !== editing.id).map((piece) => (
                    <option key={piece.id} value={piece.id}>{piece.label}</option>
                  ))}
                </select>
                {fieldError('rewriteOf')}
              </div>
            )}
          </div>

          <details className={`${ui.disclosure} ${session.timeGroup}`}
            open={editing.minutes !== null || !transcribed && editing.wordCount !== null || undefined}>
            <summary>
              <ChevronRight size={14} className="chevron" aria-hidden="true" />
              <span className={session.summaryStrong}>{transcribed ? t.writing.duration : t.writing.wordsAndDuration}</span>
            </summary>
            <div className={styles.moreFields}>
              {transcribed ? (
                <input type="hidden" name="wordCount" value={editing.wordCount ?? ''} />
              ) : (
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f6`}>{t.writing.wordsLabel}</label>
                  <input id={`${formId}-f6`} type="number" name="wordCount" min={0} className={ui.input} defaultValue={editing.wordCount ?? ''} />
                </div>
              )}
              <div className={ui.field}>
                <label htmlFor={`${formId}-f7`}>{t.writing.minutes}</label>
                <input id={`${formId}-f7`} type="number" name="minutes" min={0} className={ui.input} defaultValue={editing.minutes ?? ''} />
              </div>
              <label className={ui.check}>
                <input type="checkbox" name="timed" defaultChecked={editing.timed} />
                {t.writing.timed}
              </label>
            </div>
          </details>
        </div>

        {state.message !== null && !state.ok && <p role="alert" className={ui.fieldError}>{state.message}</p>}
      </form>
    </Drawer>
  );
}

/**
 * Abre el drawer desde el lector, o al llegar con `?editar=1` (los enlaces antiguos con `?edit`).
 * Con `trigger`, quien lo usa decide desde dónde se abre (un ítem de menú, por ejemplo).
 */
export function WritingEditor(props: Omit<Parameters<typeof WritingDrawer>[0], 'open' | 'onClose'> & {
  readonly initiallyOpen: boolean;
  readonly closeHref: string;
  readonly trigger?: (open: () => void) => ReactNode;
}) {
  const { initiallyOpen, closeHref, trigger, ...drawer } = props;
  const t = useT();
  const [open, setOpen] = useState(initiallyOpen);
  // Cada apertura empieza de cero: lo que se dejó sin guardar no vuelve a aparecer.
  const [round, setRound] = useState(0);
  const router = useRouter();
  const close = () => {
    setOpen(false);
    // Fuera de la URL lo que abría el drawer: recargar no lo reabre.
    if (initiallyOpen) router.replace(closeHref, { scroll: false });
  };
  const openDrawer = () => { setRound(round + 1); setOpen(true); };
  return (
    <>
      {trigger === undefined ? (
        <button type="button" className={ui.secondary} onClick={openDrawer} aria-haspopup="dialog">
          <Pencil size={16} aria-hidden="true" />
          {t.writing.editDetails}
        </button>
      ) : trigger(openDrawer)}
      <WritingDrawer key={round} {...drawer} open={open} onClose={close} />
    </>
  );
}
