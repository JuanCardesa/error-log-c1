'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from './overlay.module.css';
import ui from './ui.module.css';

/**
 * Panel lateral para dar de alta o editar sin salir de la vista. No es modal: no atrapa
 * el foco y la página sigue detrás. Escape lo cierra y el foco vuelve a quien lo abrió.
 * En móvil ocupa la pantalla.
 *
 * Se queda montado mientras `open` es falso si `keepMounted`: lo escrito no se pierde al
 * cerrarlo por error.
 */
export function Drawer({ open, title, onClose, children, footer, keepMounted = false }: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly keepMounted?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const trigger = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement;
    const first = ref.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    );
    first?.focus();
    return () => {
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus();
    };
  }, [open]);

  if (!open && !keepMounted) return null;

  return (
    <aside
      ref={ref}
      className={styles.drawer}
      aria-labelledby={titleId}
      hidden={!open}
      data-overlay-open={open ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.drawerHead}>
        <h2 id={titleId} className={styles.drawerTitle}>{title}</h2>
        <button type="button" className={ui.iconButton} aria-label="Cerrar" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.drawerBody}>{children}</div>
      {footer !== undefined && <div className={styles.drawerFoot}>{footer}</div>}
    </aside>
  );
}
