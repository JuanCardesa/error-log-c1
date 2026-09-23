'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { ImportedSession } from '@/lib/import/errors';
import { SessionForm } from './SessionForm';
import styles from './page.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Alta manual de una sesion, plegada tras un boton.
 *
 * La entrada diaria es la tanda de Macmillan; la sesion a mano queda a un clic, pero no
 * compite con ella. El formulario sigue montado al plegarlo: lo escrito no se pierde.
 */
export function ManualSession({ today, initiallyOpen = false, preset, returnTo }: {
  readonly today: string;
  /** Llegar con `?nueva=…` abre el formulario directamente. */
  readonly initiallyOpen?: boolean;
  /** Valores de partida, p. ej. tipo y paper Writing al venir de /writing. */
  readonly preset?: Partial<ImportedSession>;
  /** A donde volver tras crearla, si no es la propia sesion. */
  readonly returnTo?: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const bodyId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Si se llega con el formulario ya abierto, el cursor empieza en su primer campo.
  useEffect(() => {
    if (initiallyOpen) bodyRef.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, [initiallyOpen]);

  return (
    <div>
      <div className={styles.manualHead}>
        <button
          type="button"
          className={ui.secondary}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          Nueva sesión a mano
        </button>
        {!open && (
          <p className={ui.note}>
            Para practicar fuera de Macmillan, o para registrar una sesión sin errores.
          </p>
        )}
      </div>
      <div id={bodyId} ref={bodyRef} className={styles.manualBody} hidden={!open}>
        <SessionForm today={today} preset={preset} returnTo={returnTo} />
      </div>
    </div>
  );
}
