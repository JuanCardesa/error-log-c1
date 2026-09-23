'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';

import { CORRECTORS, GENRES } from '@/lib/domain/enums';
import type { SessionRow, WritingPieceRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { EMPTY_STATE } from '../registrar/formState';
import { saveWritingPieceAction } from './actions';
import { CORRECTOR_LABELS, GENRE_LABELS, KIND_LABELS } from '../_shared/labels';
import styles from './writing.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Alta y edicion de un texto con las cuatro bandas de Cambridge.
 *
 * Las bandas van por separado, no como una media, porque lo util es justo lo que la
 * media esconde: que Language sube y Organisation lleva tres meses clavada.
 */

const BANDS = [
  { name: 'bandContent', label: 'Content' },
  { name: 'bandCommunicative', label: 'Communicative' },
  { name: 'bandOrganisation', label: 'Organisation' },
  { name: 'bandLanguage', label: 'Language' },
] as const;

interface Props {
  readonly availableSessions: readonly SessionRow[];
  readonly pieces: readonly WritingPieceRow[];
  readonly editing: WritingPieceRow | null;
  readonly today: string;
}

export function PieceForm({ availableSessions, pieces, editing, today }: Props) {
  const [state, formAction, pending] = useActionState(saveWritingPieceAction, EMPTY_STATE);
  const [isRewrite, setIsRewrite] = useState(editing?.rewriteOf !== null && editing !== null);
  const { formRef, onReset, resetForm } = usePreservedForm();

  useEffect(() => {
    // Al crear se prepara el siguiente texto; al editar se conservan los valores guardados.
    if (state.ok && editing === null) resetForm();
  }, [state, editing, resetForm]);

  const errorsFor = (field: string): string[] => state.fieldErrors[field] ?? [];
  const invalid = (field: string): boolean => errorsFor(field).length > 0;

  const fieldError = (field: string) => {
    const messages = errorsFor(field);
    if (messages.length === 0) return null;
    return (
      <p className={ui.fieldError} role="alert">
        {messages.join(' ')}
      </p>
    );
  };

  const canCreate = availableSessions.length > 0 || editing !== null;

  if (!canCreate) {
    return (
      <div className={`${ui.empty} ${styles.block}`}>
        <p className={styles.emptyText}>
          No hay sesiones de Writing libres. Cada sesión admite un solo texto, así que abre
          una sesión de Writing en Registrar y vuelve.
        </p>
        {/* Tras crearla, Registrar devuelve aqui con la sesion ya disponible. */}
        <Link className={`${ui.primary} ${styles.emptyAction}`} href="/registrar?nueva=writing">
          Abrir una sesión de Writing
        </Link>
      </div>
    );
  }

  return (
    <section className={`${ui.panel} ${styles.block}`} aria-labelledby="piece-heading">
      <h2 id="piece-heading">{editing === null ? 'Nuevo texto' : `Editar texto #${String(editing.id)}`}</h2>

      <form ref={formRef} action={formAction} className={styles.form} onReset={(event) => {
        onReset(event);
        // El checkbox es estado controlado: el reset del formulario no lo desmarca solo.
        if (!event.defaultPrevented) setIsRewrite(false);
      }}>
        {editing !== null && <input type="hidden" name="id" value={editing.id} />}

        <label>
          <span className={ui.label}>Sesión</span>
          {editing === null ? (
            <select name="sessionId" required aria-invalid={invalid('sessionId')}>
              {availableSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.date} · P{session.part} · {KIND_LABELS[session.kind]}
                </option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="sessionId" value={editing.sessionId} />
          )}
          {editing !== null && <span className="data">#{editing.sessionId}</span>}
          {fieldError('sessionId')}
        </label>

        <label>
          <span className={ui.label}>Fecha</span>
          <input
            type="date"
            name="date"
            defaultValue={editing?.date ?? today}
            max={today}
            required
            className="data"
            aria-invalid={invalid('date')}
          />
          {fieldError('date')}
        </label>

        <label>
          <span className={ui.label}>Género</span>
          <select name="genre" defaultValue={editing?.genre ?? 'ESSAY'}>
            {GENRES.map((value) => (
              <option key={value} value={value}>
                {GENRE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={ui.label}>Palabras</span>
          <input
            type="number"
            name="wordCount"
            min={0}
            className="data"
            defaultValue={editing?.wordCount ?? ''}
          />
        </label>

        <label>
          <span className={ui.label}>Minutos</span>
          <input
            type="number"
            name="minutes"
            min={0}
            className="data"
            defaultValue={editing?.minutes ?? ''}
          />
        </label>

        <label>
          <span className={ui.label}>Corrector</span>
          <select name="corrector" defaultValue={editing?.corrector ?? ''}>
            <option value="">sin corregir</option>
            {CORRECTORS.map((value) => (
              <option key={value} value={value}>
                {CORRECTOR_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${ui.check} ${styles.checkCell}`}>
          <input type="checkbox" name="timed" defaultChecked={editing?.timed ?? false} />
          <span>Cronometrado</span>
        </label>

        <fieldset className={styles.bands}>
          <legend className={ui.label}>Bandas Cambridge (0–5)</legend>
          <div className={styles.bandGrid}>
            {BANDS.map((band) => (
              <label key={band.name}>
                <span className={styles.bandLabel}>{band.label}</span>
                <input
                  type="number"
                  name={band.name}
                  min={0}
                  max={5}
                  className="data"
                  defaultValue={editing?.[band.name] ?? ''}
                  aria-invalid={invalid(band.name)}
                />
                {fieldError(band.name)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.rewrite}>
          <legend className={ui.label}>Reescritura</legend>
          <label className={ui.check}>
            <input
              type="checkbox"
              checked={isRewrite}
              onChange={(event) => {
                setIsRewrite(event.target.checked);
              }}
            />
            <span>Es la reescritura de otro texto</span>
          </label>

          {isRewrite && (
            <label>
              <span className={ui.label}>Original</span>
              <select
                name="rewriteOf"
                defaultValue={editing?.rewriteOf ?? ''}
                aria-invalid={invalid('rewriteOf')}
              >
                <option value="">elige el original</option>
                {pieces
                  .filter((piece) => editing === null || piece.id !== editing.id)
                  .map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      #{piece.id} · {piece.date} · {GENRE_LABELS[piece.genre]}
                    </option>
                  ))}
              </select>
              {fieldError('rewriteOf')}
            </label>
          )}
        </fieldset>

        <div className={styles.actions}>
          <button type="submit" className={ui.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : editing === null ? 'Guardar texto' : 'Actualizar'}
          </button>
        </div>
      </form>

      {state.message !== null && (
        <p className={state.ok ? ui.noticeOk : ui.noticeError} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      )}
    </section>
  );
}
