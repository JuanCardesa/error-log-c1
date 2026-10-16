import type { ReactNode } from 'react';

import ui from './ui.module.css';

/**
 * La fila de filtros de una lista: búsqueda (`search`, normalmente `LiveSearch`), luego
 * píldoras y `FilterMenu`, y al final `aside` (el recuento). Todo se aplica al momento y
 * vive en la URL, así que no lleva botón de aplicar.
 */
export function FilterBar({ search, children, aside }: {
  readonly search?: ReactNode;
  readonly children?: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <div className={ui.filterBar}>
      {search}
      {children}
      {aside !== undefined && <span className={ui.filterAside}>{aside}</span>}
    </div>
  );
}
