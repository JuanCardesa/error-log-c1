'use client';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Menu } from '../_shared/Menu';
import overlay from '../_shared/overlay.module.css';
import ui from '../_shared/ui.module.css';
import { type ListParams, listHref } from './listParams';
import styles from './sessions.module.css';

/**
 * Búsqueda y filtros del historial. Todo vive en la URL: volver desde una sesión
 * recupera la misma búsqueda y página. La búsqueda filtra al escribir, en el servidor.
 */

const PRACTICES: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'todas' },
  { value: 'RUOE', label: 'Reading & Use of English' },
  { value: 'WRITING', label: 'Writing' },
  { value: 'LISTENING', label: 'Listening' },
  { value: 'SPEAKING', label: 'Speaking' },
  { value: 'libre', label: 'Sin formato de examen' },
];

const DEBOUNCE_MS = 250;

export function SessionsToolbar({ params, openCount }: { readonly params: ListParams; readonly openCount: number }) {
  const router = useRouter();
  const [q, setQ] = useState(params.q);

  useEffect(() => {
    if (q.trim() === params.q) return;
    const timer = setTimeout(() => {
      router.replace(listHref(params, { q: q.trim() }), { scroll: false });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
    // Solo al teclear: los demás filtros ya navegan por su cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const practice = PRACTICES.find((item) => item.value === params.practica) ?? PRACTICES[0];

  return (
    <div className={styles.toolbar}>
      <input
        type="search"
        className={`${ui.input} ${styles.search}`}
        value={q}
        onChange={(event) => { setQ(event.target.value); }}
        placeholder="Buscar por referencia, fuente o fecha…"
        aria-label="Buscar sesión"
      />
      <nav className={ui.pills} aria-label="Estado">
        <Link href={listHref(params, { estado: '' })} className={ui.pill} aria-current={params.estado === '' ? 'true' : undefined} scroll={false}>
          Todas
        </Link>
        <Link href={listHref(params, { estado: 'abiertas' })} className={ui.pill} aria-current={params.estado === 'abiertas' ? 'true' : undefined} scroll={false}>
          Abiertas ({openCount})
        </Link>
      </nav>
      <span className={ui.spacer} />
      <Menu
        label="Práctica"
        trigger={(props) => (
          <button type="button" {...props} className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}>
            Práctica: {practice?.label ?? 'todas'}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      >
        {(close) => PRACTICES.map((item) => (
          <Link
            key={item.value}
            role="menuitem"
            href={listHref(params, { practica: item.value })}
            className={overlay.menuItem}
            aria-current={item.value === params.practica ? 'page' : undefined}
            onClick={close}
            scroll={false}
          >
            {item.label === 'todas' ? 'Todas las prácticas' : item.label}
          </Link>
        ))}
      </Menu>
      <Link
        href={listHref(params, { orden: params.orden === 'asc' ? '' : 'asc' })}
        className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}
        scroll={false}
        aria-label={params.orden === 'asc' ? 'Fecha: más antiguas primero. Cambiar a más recientes' : 'Fecha: más recientes primero. Cambiar a más antiguas'}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        Fecha {params.orden === 'asc' ? '↑' : '↓'}
      </Link>
    </div>
  );
}
