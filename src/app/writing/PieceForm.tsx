'use client';

import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { CORRECTORS, GENRES } from '@/lib/domain/enums';
import type { SessionRow, WritingPieceRow } from '@/lib/domain/types';
import { Drawer } from '../_shared/Drawer';
import { mediumDate, sessionTitle, shortDate } from '../_shared/format';
import { CORRECTOR_LABELS, GENRE_LABELS } from '../_shared/labels';
import { useToast } from '../_shared/Toast';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { EMPTY_STATE } from '../registrar/formState';
import session from '../registrar/session.module.css';
import ui from '../_shared/ui.module.css';
import { saveWritingPieceAction } from './actions';
import { BANDS } from './bands';
import styles from './writing.module.css';

/**
 * Alta y edición de un texto de Writing en el drawer. Guarda la evaluación, no el ensayo.
 * Fecha, minutos y cronómetro se proponen desde la sesión elegida y se pueden cambiar.
 * Las bandas vacías se guardan como «Sin evaluar», no como cero.
 */

export interface PieceOption {
  readonly id: number;
  readonly label: string;
}

export function WritingDrawer({ open, onClose, availableSessions, originals, editing, editingSession, initialSessionId, initialRewriteOf, today }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly availableSessions: readonly SessionRow[];
  readonly originals: readonly PieceOption[];
  readonly editing: WritingPieceRow | null;
  readonly editingSession: SessionRow | null;
  readonly initialSessionId: number | null;
  readonly initialRewriteOf: number | null;
  readonly today: string;
}) {
  const formId = useId();
  const [state, formAction, pending] = useActionState(saveWritingPieceAction, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();
  const toast = useToast();
  const handled = useRef<typeof state | null>(null);
  const firstSession = availableSessions.find((row) => row.id === initialSessionId) ?? availableSessions[0] ?? null;
  const [pickedId, setSessionId] = useState<number | null>(editing?.sessionId ?? firstSession?.id ?? null);
  // Si otra pestaña (o el último guardado) ocupó la sesión elegida, se propone la primera libre.
  const sessionId = editing !== null || availableSessions.some((row) => row.id === pickedId)
    ? pickedId
    : availableSessions[0]?.id ?? null;
  const [isRewrite, setIsRewrite] = useState(editing !== null ? editing.rewriteOf !== null : initialRewriteOf !== null);
  const chosen = editing !== null ? editingSession : availableSessions.find((row) => row.id === sessionId) ?? null;
  const canCreate = editing !== null || availableSessions.length > 0;

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast({ message: editing === null ? 'Writing guardado' : 'Writing actualizado' });
      onClose();
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, editing, onClose, toast, formRef]);

  const errorsFor = (field: string): string[] => state.fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;
  const errorId = (field: string): string => `${formId}-${field}-error`;
  const describedBy = (field: string): string | undefined => (invalid(field) ? errorId(field) : undefined);
  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return <p className={ui.fieldError} id={errorId(field)}>{messages.map((message) => <span key={message}>{message}</span>)}</p>;
  };
  const evaluated = editing !== null && (editing.corrector !== null || BANDS.some((band) => editing[band.name] !== null));
  const evaluationInvalid = BANDS.some((band) => invalid(band.name));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing === null ? 'Registrar Writing' : 'Editar Writing'}
      footer={canCreate ? (
        <>
          <button type="button" className={ui.ghost} onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="submit" form={formId} className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : editing === null ? 'Guardar Writing' : 'Guardar cambios'}
          </button>
        </>
      ) : undefined}
    >
      {!canCreate ? (
        <div className={styles.noSession}>
          <p>No hay sesiones de Writing libres. Cada sesión admite un solo texto: crea la sesión y vuelve aquí con ella elegida.</p>
          <Link href="/registrar?nueva=writing" className={ui.primary}>
            <Plus size={16} aria-hidden="true" />
            Crear sesión Writing
          </Link>
        </div>
      ) : (
        <form id={formId} ref={formRef} action={formAction} onReset={onReset} className={session.form}>
          {editing !== null && <input type="hidden" name="id" value={editing.id} />}

          <div className={session.group}>
            <span className={session.groupLabel}>Sesión</span>
            <div className={session.groupStack}>
              {editing === null ? (
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f1`}>Sesión Writing libre</label>
                  <select id={`${formId}-f1`}
                    name="sessionId"
                    className={ui.select}
                    value={sessionId ?? ''}
                    onChange={(event) => { setSessionId(Number(event.target.value)); }}
                    aria-invalid={invalid('sessionId')}
                    aria-describedby={describedBy('sessionId')}
                  >
                    {availableSessions.map((row) => (
                      <option key={row.id} value={row.id}>{shortDate(row.date)} · {sessionTitle(row)} · Part {row.part}</option>
                    ))}
                  </select>
                  {fieldError('sessionId')}
                </div>
              ) : (
                <>
                  <input type="hidden" name="sessionId" value={editing.sessionId} />
                  <p className={styles.fixedSession}>
                    {editingSession === null ? `Sesión #${String(editing.sessionId)}` : `${mediumDate(editingSession.date)} · ${sessionTitle(editingSession)}`}
                  </p>
                  {fieldError('sessionId')}
                </>
              )}
              <span className={ui.help}>
                {editing === null
                  ? <>Fecha y minutos se proponen desde la sesión; puedes cambiarlos. <Link href="/registrar?nueva=writing">Crear otra sesión Writing</Link></>
                  : 'La sesión de un texto ya guardado no cambia.'}
              </span>
            </div>
          </div>

          {/* Con la sesión cambian las propuestas: los campos se vuelven a montar con ellas. */}
          <div key={chosen?.id ?? 'none'} className={styles.drawerGroups}>
            <div className={session.group}>
              <span className={session.groupLabel}>Texto</span>
              <div className={session.grid2}>
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f2`}>Fecha</label>
                  <input id={`${formId}-f2`}
                    type="date"
                    name="date"
                    required
                    max={today}
                    className={ui.input}
                    defaultValue={editing?.date ?? chosen?.date ?? today}
                    aria-invalid={invalid('date')}
                    aria-describedby={describedBy('date')}
                  />
                  {fieldError('date')}
                </div>
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f3`}>Género</label>
                  <select id={`${formId}-f3`} name="genre" className={ui.select} defaultValue={editing?.genre ?? 'ESSAY'}>
                    {GENRES.map((value) => <option key={value} value={value}>{GENRE_LABELS[value]}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <details className={`${ui.disclosure} ${session.timeGroup}`} open={evaluated || evaluationInvalid || undefined}>
              <summary>
                <ChevronRight size={14} className="chevron" aria-hidden="true" />
                <span className={session.summaryStrong}>Añadir evaluación</span>
                <span className={ui.optional}>· si ya está corregido</span>
              </summary>
              <div className={styles.evaluation}>
                <div className={`${ui.field} ${styles.corrector}`}>
                  <label htmlFor={`${formId}-f4`}>Corrector</label>
                  <select id={`${formId}-f4`} name="corrector" className={ui.select} defaultValue={editing?.corrector ?? ''}>
                    <option value="">Sin corregir</option>
                    {CORRECTORS.map((value) => <option key={value} value={value}>{CORRECTOR_LABELS[value]}</option>)}
                  </select>
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
                        placeholder="0–5"
                        className={ui.input}
                        defaultValue={editing?.[band.name] ?? ''}
                        aria-invalid={invalid(band.name)}
                        aria-describedby={describedBy(band.name)}
                      />
                      {fieldError(band.name)}
                    </label>
                  ))}
                </div>
                <span className={ui.help}>Las bandas vacías se guardan como «Sin evaluar», no como cero.</span>
              </div>
            </details>

            <div className={`${session.timeGroup} ${styles.rewrite}`}>
              <label className={ui.check}>
                <input type="checkbox" checked={isRewrite} onChange={(event) => { setIsRewrite(event.target.checked); }} />
                Es una reescritura
              </label>
              {isRewrite && (
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f5`}>Texto original</label>
                  <select id={`${formId}-f5`}
                    name="rewriteOf"
                    className={ui.select}
                    defaultValue={editing?.rewriteOf ?? initialRewriteOf ?? ''}
                    aria-invalid={invalid('rewriteOf')}
                    aria-describedby={describedBy('rewriteOf')}
                  >
                    <option value="">Elige el original</option>
                    {originals.filter((piece) => piece.id !== editing?.id).map((piece) => (
                      <option key={piece.id} value={piece.id}>{piece.label}</option>
                    ))}
                  </select>
                  {fieldError('rewriteOf')}
                </div>
              )}
            </div>

            <details className={`${ui.disclosure} ${session.timeGroup}`} open={editing?.wordCount != null || undefined}>
              <summary>
                <ChevronRight size={14} className="chevron" aria-hidden="true" />
                <span className={session.summaryStrong}>Palabras y duración</span>
              </summary>
              <div className={styles.moreFields}>
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f6`}>Palabras</label>
                  <input id={`${formId}-f6`} type="number" name="wordCount" min={0} className={ui.input} defaultValue={editing?.wordCount ?? ''} />
                </div>
                <div className={ui.field}>
                  <label htmlFor={`${formId}-f7`}>Minutos</label>
                  <input id={`${formId}-f7`} type="number" name="minutes" min={0} className={ui.input} defaultValue={editing?.minutes ?? chosen?.durationMin ?? ''} />
                </div>
                <label className={ui.check}>
                  <input type="checkbox" name="timed" defaultChecked={editing?.timed ?? chosen?.timed ?? false} />
                  Cronometrado
                </label>
              </div>
            </details>
          </div>

          {state.message !== null && !state.ok && <p role="alert" className={ui.fieldError}>{state.message}</p>}
        </form>
      )}
    </Drawer>
  );
}

/** Abre el drawer de Writing desde la cabecera, desde una fila o desde la URL. */
export function WritingEditor(props: Omit<Parameters<typeof WritingDrawer>[0], 'open' | 'onClose'> & {
  readonly initiallyOpen: boolean;
  readonly closeHref: string;
  readonly label?: string;
}) {
  const { initiallyOpen, closeHref, label, ...drawer } = props;
  const [open, setOpen] = useState(initiallyOpen);
  // Cada apertura empieza de cero: lo guardado antes no se arrastra al siguiente texto.
  const [round, setRound] = useState(0);
  const router = useRouter();
  const close = () => {
    setOpen(false);
    // Fuera de la URL lo que abría el drawer (`edit`, `registrar`): recargar no lo reabre.
    if (initiallyOpen) router.replace(closeHref, { scroll: false });
  };
  return (
    <>
      {label !== undefined && (
        <button type="button" className={ui.primary} onClick={() => { setRound(round + 1); setOpen(true); }} aria-haspopup="dialog">
          <Plus size={16} aria-hidden="true" />
          {label}
        </button>
      )}
      <WritingDrawer key={round} {...drawer} open={open} onClose={close} />
    </>
  );
}
