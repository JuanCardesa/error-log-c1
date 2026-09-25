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
import { ANKI_STATE_LABELS, CATEGORY_LABELS, CAUSE_LABELS, CONFIDENCE_LABELS, ankiState } from '../labels';
import { useToast } from '../Toast';
import { usePreservedForm } from '../usePreservedForm';
import { ankiClass } from './ankiClass';
import styles from './panel.module.css';
import ui from '../ui.module.css';

/**
 * Detalle de un error: leerlo entero sin entrar a editarlo, y editarlo en el mismo sitio.
 * En escritorio es una columna lateral no modal; por debajo de 1024 px ocupa la pantalla.
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
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState(error.id);
  const panelRef = useRef<HTMLElement>(null);
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
  const anki = ankiOverride ?? { label: ANKI_STATE_LABELS[state], className: ankiClass(state) };
  const title = sessionTitle(session);
  const canStep = position !== null && position.total > 1;

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      aria-label="Detalle del error"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        if (editing) setEditing(false);
        else onClose();
      }}
    >
      <div className={styles.head}>
        <span className={styles.context}>
          {error.itemRef === null ? 'Error' : `Error ${error.itemRef}`} · {title}
          {position !== null && <span className={styles.position}> · {position.index + 1} de {position.total}</span>}
        </span>
        <button type="button" className={ui.iconButton} aria-label="Error anterior" onClick={onPrev} disabled={!canStep}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className={ui.iconButton} aria-label="Error siguiente" onClick={onNext} disabled={!canStep}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button ref={closeButton} type="button" className={ui.iconButton} aria-label="Cerrar detalle" onClick={onClose}>
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
            <span className={styles.ruleLabel}>Regla</span>
            <p>{error.ruleNote}</p>
          </div>
          <dl className={styles.facts}>
            <dt>Categoría</dt>
            <dd>
              {CATEGORY_LABELS[error.category]}
              {error.subcategory !== null && <span className={ui.cellSub}> · {error.subcategory}</span>}
            </dd>
            <dt>Causa</dt>
            <dd>{CAUSE_LABELS[error.cause]}</dd>
            <dt>Confianza</dt>
            <dd>{CONFIDENCE_LABELS[error.confidence]}</dd>
            <dt>Anki</dt>
            <dd className={anki.className}>{anki.label}</dd>
            <dt>Sesión</dt>
            <dd>
              {showSessionLink ? (
                <Link href={`/registrar?s=${String(session.id)}&error=${String(error.id)}`}>
                  {shortDate(session.date)} · {title}
                </Link>
              ) : (
                `${shortDate(session.date)} · ${title}`
              )}
            </dd>
          </dl>
          <div className={styles.actions}>
            <button ref={editButton} type="button" className={ui.secondary} onClick={() => { setEditing(true); }}>
              Editar error
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
      toast({ message: 'Error guardado' });
      onDone();
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, onDone, toast, formRef]);

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
            Borrar error…
          </button>
          <span className={ui.spacer} />
          <button type="button" className={ui.ghost} onClick={onDone} disabled={pending}>Cancelar</button>
          <button type="submit" className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={error.itemRef === null ? 'Borrar este error' : `Borrar el error ${error.itemRef}`}
        confirmLabel="Borrar error"
        pending={deleting}
        error={deleteError}
        aside={error.ankiAdded ? 'Su nota de Anki se conserva. No se puede deshacer.' : 'No se puede deshacer.'}
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
              setDeleteError('No se pudo confirmar el borrado. Recarga la sesión antes de repetirlo.');
            }
          });
        }}
      >
        <p>
          Se eliminará «{error.correctAnswer}» de «{sessionTitle(session)}».
        </p>
      </ConfirmDialog>
    </>
  );
}

type FormStateLike = typeof EMPTY_STATE;
