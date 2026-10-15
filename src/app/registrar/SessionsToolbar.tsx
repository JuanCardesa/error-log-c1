'use client';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useT } from '../_shared/i18nClient';
import { Menu } from '../_shared/Menu';
import overlay from '../_shared/overlay.module.css';
import ui from '../_shared/ui.module.css';
import { type ListParams, listHref } from './listParams';
import styles from './sessions.module.css';

/**
 * Búsqueda y filtros del historial. Todo vive en la URL: volver desde una sesión
 * recupera la misma búsqueda y página. La búsqueda filtra al escribir, en el servidor.
 */

/** `''` son todas; `libre`, sin formato de examen; el resto, un paper. */
const PRACTICES = ['', 'RUOE', 'WRITING', 'LISTENING', 'SPEAKING', 'libre'] as const;

const DEBOUNCE_MS = 250;

export function SessionsToolbar({ params, openCount }: { readonly params: ListParams; readonly openCount: number }) {
  const t = useT();
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

  const practiceLabel = (value: (typeof PRACTICES)[number]): string => value === '' ? t.sessionView.practiceAll
    : value === 'libre' ? t.format.noExamFormat : t.labels.paperLong[value];
  const practice = PRACTICES.find((value) => value === params.practica) ?? '';

  return (
    <div className={styles.toolbar}>
      <input
        type="search"
        className={`${ui.input} ${styles.search}`}
        value={q}
        onChange={(event) => { setQ(event.target.value); }}
        placeholder={t.sessionView.searchPlaceholder}
        aria-label={t.sessionView.searchLabel}
      />
      <nav className={ui.pills} aria-label={t.sessionView.status}>
        <Link href={listHref(params, { estado: '' })} className={ui.pill} aria-current={params.estado === '' ? 'true' : undefined} scroll={false}>
          {t.common.all}
        </Link>
        <Link href={listHref(params, { estado: 'abiertas' })} className={ui.pill} aria-current={params.estado === 'abiertas' ? 'true' : undefined} scroll={false}>
          {t.sessionView.openCount(openCount)}
        </Link>
      </nav>
      <span className={ui.spacer} />
      <Menu
        label={t.sessionForm.practice}
        trigger={(props) => (
          <button type="button" {...props} className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}>
            {t.sessionView.practiceFilter(practiceLabel(practice))}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      >
        {(close) => PRACTICES.map((value) => (
          <Link
            key={value}
            role="menuitem"
            href={listHref(params, { practica: value })}
            className={overlay.menuItem}
            aria-current={value === params.practica ? 'page' : undefined}
            onClick={close}
            scroll={false}
          >
            {value === '' ? t.sessionView.allPractices : practiceLabel(value)}
          </Link>
        ))}
      </Menu>
      <Link
        href={listHref(params, { orden: params.orden === 'asc' ? '' : 'asc' })}
        className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}
        scroll={false}
        aria-label={params.orden === 'asc' ? t.sessionView.sortAsc : t.sessionView.sortDesc}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        {t.sessionForm.date} {params.orden === 'asc' ? '↑' : '↓'}
      </Link>
    </div>
  );
}
