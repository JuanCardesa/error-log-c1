'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import styles from './overlay.module.css';

/**
 * Botón que abre un menú de acciones. Flechas para moverse, Escape para cerrar y el foco
 * vuelve al botón. Un clic fuera también lo cierra.
 *
 * `trigger` recibe los props que debe llevar el botón; los ítems son `<a>` o `<button>`
 * con la clase `menuItem` del módulo de capas.
 */
export function Menu({ trigger, children, align = 'end', label }: {
  readonly trigger: (props: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    ref: React.RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
  readonly children: (close: () => void) => ReactNode;
  readonly align?: 'start' | 'end';
  readonly label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = (): HTMLElement[] =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('pointerdown', onPointer); };
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={wrap} className={styles.menuWrap}>
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => { setOpen((value) => !value); },
        ref: button,
      })}
      <div
        ref={menu}
        id={id}
        role="menu"
        aria-label={label}
        hidden={!open}
        className={`${styles.menu} ${align === 'end' ? styles.menuEnd : styles.menuStart}`}
        data-overlay-open={open ? '' : undefined}
        onKeyDown={(event) => {
          const list = items();
          const index = list.indexOf(document.activeElement as HTMLElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            list[(index + 1) % list.length]?.focus();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            list[(index - 1 + list.length) % list.length]?.focus();
          } else if (event.key === 'Tab') {
            setOpen(false);
          }
        }}
      >
        {open && children(() => { setOpen(false); })}
      </div>
    </div>
  );
}
