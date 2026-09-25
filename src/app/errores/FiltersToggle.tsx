'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import ui from '../_shared/ui.module.css';
import styles from './errores.module.css';

/** Botón «Filtros» que despliega el formulario de filtros bajo la barra. */
export function FiltersToggle({ active, children }: { readonly active: number; readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={ui.secondary}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { setOpen(!open); }}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filtros{active > 0 ? ` · ${String(active)}` : ''}
      </button>
      <div id={id} hidden={!open} className={styles.filtersPanel}>
        {children}
      </div>
    </>
  );
}
