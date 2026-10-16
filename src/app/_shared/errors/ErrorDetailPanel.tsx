'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import type { ErrorRow, SessionRow } from '@/lib/domain/types';
import { deleteErrorAction, updateErrorAction } from '../../registrar/actions';
import { ErrorFields } from '../../registrar/ErrorFields';
import { EMPTY_STATE } from '../../registrar/formState';
import { ConfirmDialog } from '../ConfirmDialog';
import { CorrectionPair } from '../CorrectionPair';
import { sessionTitle, shortDate } from '../format';
import { useT } from '../i18nClient';
import { ankiState } from '../labels';
import { useInertBehind, useMediaQuery } from '../layer';
import { useToast } from '../Toast';
import { usePreservedForm } from '../usePreservedForm';
import { ankiClass } from './ankiClass';
import { ErrorNotebookLinks } from './ErrorNotebookLinks';
import styles from './panel.module.css';
import ui from '../ui.module.css';

/**
 * Detalle de un error: leerlo entero sin entrar a editarlo, y editarlo en el mismo sitio.
 * En escritorio es una columna lateral no modal; por debajo de 1024 px ocupa la pantalla y
 * deja el fondo inerte.
 * Escape sale de la edición y, si no se está editando, cierra el panel.
 */
export function ErrorDetailPanel({
  error,
  session,
  position,
  onPrev,
  onNext,
  onClose,
  onDeleted,
  subcategorySuggestions,
  showSessionLink = true,
  ankiOverride,
}: {
  readonly error: ErrorRow;
  readonly session: SessionRow;
  readonly position: { readonly index: number; readonly total: number } | null;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
  readonly subcategorySuggestions: readonly string[];
  readonly showSessionLink?: boolean;
  /** Estado Anki que la vista conoce mejor (p. ej. «Desactualizada» en Anki). */
  readonly ankiOverride?: { readonly label: string; readonly className: string };
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState(error.id);
  const panelRef = useRef<HTMLElement>(null);
  // Bajo 1024 px el detalle es una pantalla: la tabla de detrás no se alcanza.
  useInertBehind(panelRef, useMediaQuery('(max-width: 1023px)'));
  const closeButton = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => { closeButton.current?.focus(); }, [error.id]);

  // Cambiar de error sale de la edición: el formulario era del anterior.
  if (editingId !== error.id) {
    setEditingId(error.id);
    setEditing(false);
  }

  // Al salir de la edición (guardar, cancelar o Escape) el foco vuelve a «Editar error».
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const state = ankiState(error);
  const anki = ankiOverride ?? { label: t.labels.ankiState[state], className: ankiClass(state) };
  const title = sessionTitle(session, t);
  const canStep = position !== null && position.total > 1;

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      aria-label={t.errors.detail}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        if (editing) setEditing(false);
        else onClose();
      }}
    >
      <div className={styles.head}>
        {/* La sesión ya está en los datos de abajo: aquí, qué error es y dónde va. */}
        <span className={styles.context}>
          {t.errors.errorRef(error.itemRef)}
          {position !== null && <span className={styles.position}>{t.errors.position(position.index + 1, position.total)}</span>}
        </span>
        <button type="button" className={ui.iconButton} aria-label={t.review.prevError} onClick={onPrev} disabled={!canStep}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className={ui.iconButton} aria-label={t.review.nextError} onClick={onNext} disabled={!canStep}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button ref={closeButton} type="button" className={ui.iconButton} aria-label={t.errors.closeDetail} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {editing ? (
        <EditError
          key={error.id}
          error={error}
          session={session}
          subcategorySuggestions={subcategorySuggestions}
          onDone={() => { setEditing(false); }}
          onDeleted={onDeleted}
        />
      ) : (
        <div className={styles.view}>
          <p className={styles.prompt}>{error.prompt}</p>
          <CorrectionPair mine={error.myAnswer} correct={error.correctAnswer} variant="detail" />
          <div className={styles.rule}>
            <span className={styles.ruleLabel}>{t.errorForm.rule}</span>
            <p>{error.ruleNote}</p>
          </div>
          <dl className={styles.facts}>
            <dt>{t.errorForm.category}</dt>
            <dd>
              {t.labels.category[error.category]}
              {error.subcategory !== null && <span className={ui.cellSub}> · {error.subcategory}</span>}
            </dd>
            <dt>{t.errorForm.cause}</dt>
            <dd>{t.labels.cause[error.cause]}</dd>
            <dt>{t.errorForm.confidence}</dt>
            <dd>{t.labels.confidence[error.confidence]}</dd>
            <dt>Anki</dt>
            <dd>
              <span className={anki.className}>{anki.label}</span>
              {ankiOverride === undefined && state === 'PENDING' && (
                <> · <Link href={`/anki?error=${String(error.id)}`}>{t.errors.ankiCreate}</Link></>
              )}
              {ankiOverride === undefined && state === 'LEGACY' && (
                <span className={styles.ankiHint}>
                  {t.errors.ankiLegacyHint} <Link href="/anki?tab=convertidas">{t.errors.ankiLegacyLink}</Link>
                </span>
              )}
            </dd>
            <dt>{t.errors.session}</dt>
            <dd>
              {showSessionLink ? (
                <Link href={`/registrar?s=${String(session.id)}&error=${String(error.id)}`}>
                  {shortDate(session.date, t)} · {title}
                </Link>
              ) : (
                `${shortDate(session.date, t)} · ${title}`
              )}
            </dd>
          </dl>
          <ErrorNotebookLinks key={error.id} errorId={error.id} />
          <div className={styles.actions}>
            <button ref={editButton} type="button" className={ui.secondary} onClick={() => { setEditing(true); }}>
              {t.errors.editError}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function EditError({ error, session, subcategorySuggestions, onDone, onDeleted }: {
  readonly error: ErrorRow;
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
  readonly onDone: () => void;
  readonly onDeleted: () => void;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(updateErrorAction, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const handled = useRef<FormStateLike | null>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('textarea, input:not([type=hidden])')?.focus();
  }, [formRef]);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast({ message: t.errorForm.saved });
      onDone();
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, onDone, toast, formRef, t]);

  return (
    <>
      <form ref={formRef} action={formAction} onReset={onReset} className={styles.edit}>
        <input type="hidden" name="id" value={error.id} />
        <input type="hidden" name="sessionId" value={error.sessionId} />
        <ErrorFields
          timed={session.timed}
          subcategorySuggestions={subcategorySuggestions}
          fieldErrors={state.fieldErrors}
          defaults={error}
          layout="panel"
        />
        {state.message !== null && !state.ok && <p role="alert" className={ui.fieldError}>{state.message}</p>}
        <div className={styles.editActions}>
          <button type="button" className={ui.dangerLink} onClick={() => { setDeleteError(null); setConfirming(true); }}>
            {t.errors.deleteErrorMenu}
          </button>
          <span className={ui.spacer} />
          <button type="button" className={ui.ghost} onClick={onDone} disabled={pending}>{t.common.cancel}</button>
          <button type="submit" className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? t.common.saving : t.common.saveChanges}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={t.errors.deleteTitle(error.itemRef)}
        confirmLabel={t.errors.deleteError}
        pending={deleting}
        error={deleteError}
        aside={`${error.ankiAdded ? t.errors.ankiNoteKept : ''}${t.common.cannotUndo}`}
        onCancel={() => { setConfirming(false); }}
        onConfirm={() => {
          startDelete(async () => {
            try {
              const result = await deleteErrorAction(error.id);
              if (!result.ok) {
                setDeleteError(result.message);
                return;
              }
              setConfirming(false);
              toast({ message: result.message });
              onDeleted();
            } catch {
              setDeleteError(t.errors.deleteUncertain);
            }
          });
        }}
      >
        <p>{t.errors.deleteBody(error.correctAnswer, sessionTitle(session, t))}</p>
      </ConfirmDialog>
    </>
  );
}

type FormStateLike = typeof EMPTY_STATE;
