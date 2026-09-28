'use client';

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ImportedSession } from '@/lib/import/errors';
import { Kbd } from '../_shared/Kbd';
import { isPlainKey } from '../_shared/shortcuts';
import { SessionDrawer } from './SessionForm';
import ui from '../_shared/ui.module.css';

/**
 * «Nueva sesión manual»: abre el drawer de alta. La tecla N lo abre desde Sesiones.
 * Llegar con `?nueva=…` lo abre directamente, con Writing puesto si viene de /writing.
 */
export function ManualSession({ today, initiallyOpen = false, preset, returnTo, label = 'Nueva sesión manual', variant = 'secondary', shortcut = false }: {
  readonly today: string;
  readonly initiallyOpen?: boolean;
  readonly preset?: Partial<ImportedSession>;
  readonly returnTo?: string;
  readonly label?: string;
  readonly variant?: 'secondary' | 'plain';
  /** Solo un botón por página atiende la tecla N. */
  readonly shortcut?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || !isPlainKey(event)) return;
      event.preventDefault();
      // El foco pasa antes por el botón: al cerrar el drawer vuelve a él, no al documento.
      button.current?.focus();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [shortcut]);

  return (
    <>
      <button ref={button} type="button" className={ui.secondary} onClick={() => { setOpen(true); }} aria-haspopup="dialog">
        {variant === 'secondary' && <Plus size={16} aria-hidden="true" />}
        {label}
        {shortcut && <Kbd>N</Kbd>}
      </button>
      <SessionDrawer open={open} onClose={() => { setOpen(false); }} today={today} preset={preset} returnTo={returnTo} />
    </>
  );
}
