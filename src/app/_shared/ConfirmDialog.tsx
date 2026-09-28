'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from './overlay.module.css';
import ui from './ui.module.css';

/**
 * Confirmación de lo que no se puede deshacer. `<dialog>` nativo: fondo inerte, foco
 * atrapado y devuelto al disparador al cerrar. El foco empieza en Cancelar, la opción
 * segura. El texto nombra el objeto y todas sus consecuencias.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  aside,
  confirmLabel,
  pendingLabel,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly aside?: ReactNode;
  readonly confirmLabel: string;
  readonly pendingLabel?: string;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={styles.dialog}
      onCancel={(event) => {
        // Escape: se cierra por el estado de React, no por detrás de él.
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
          <div id={bodyId}>{children}</div>
          {aside !== undefined && <p className={styles.dialogAside}>{aside}</p>}
          {error !== null && <p role="alert" className={ui.fieldError}>{error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={ui.secondary} autoFocus onClick={onCancel} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className={ui.danger} onClick={onConfirm} disabled={pending} aria-busy={pending}>
              {pending ? (pendingLabel ?? 'Borrando…') : confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
