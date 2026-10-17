'use client';

import { ChevronDown, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Menu } from './Menu';
import overlay from './overlay.module.css';
import ui from './ui.module.css';

export interface FilterOption {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

/**
 * Un filtro de `FilterBar` como menú de enlaces: elegir navega y se aplica al momento.
 *
 * `text` es solo el nombre mientras el filtro no filtra («Causa») y «Nombre: valor» cuando
 * sí («Causa: Confusión»); entonces lleva `clear`, se ve en tinte de marca y tiene su × para
 * quitarlo sin abrir el menú. Un menú de orden no es un filtro: dice siempre su valor.
 */
export function FilterMenu({ label, text, icon, options, clear, align = 'start' }: {
  /** Nombre del menú para el lector de pantalla («Causa»). */
  readonly label: string;
  readonly text: string;
  readonly icon?: ReactNode;
  readonly options: readonly FilterOption[];
  readonly clear?: { readonly href: string; readonly label: string };
  /** `end` cuando el filtro va pegado al borde derecho de la barra. */
  readonly align?: 'start' | 'end';
}) {
  const menu = (
    <Menu
      label={label}
      align={align}
      trigger={(props) => (
        <button type="button" {...props} className={ui.filterButton}>
          {icon}
          {text}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => options.map((option) => (
        <Link
          key={option.key}
          role="menuitem"
          href={option.href}
          className={overlay.menuItem}
          aria-current={option.current ? 'page' : undefined}
          onClick={close}
          scroll={false}
        >
          {option.label}
        </Link>
      ))}
    </Menu>
  );
  if (clear === undefined) return menu;
  return (
    <span className={ui.filterActive}>
      {menu}
      <Link href={clear.href} className={ui.chipX} aria-label={clear.label} scroll={false}>
        <X size={14} aria-hidden="true" />
      </Link>
    </span>
  );
}
