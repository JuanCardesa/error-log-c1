'use client';

import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FilterBar } from '../_shared/FilterBar';
import { FilterMenu } from '../_shared/FilterMenu';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { type ListParams, listHref } from './listParams';

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
    <FilterBar
      search={(
        <input
          type="search"
          className={`${ui.input} ${ui.filterSearch}`}
          value={q}
          onChange={(event) => { setQ(event.target.value); }}
          placeholder={t.sessionView.searchPlaceholder}
          aria-label={t.sessionView.searchLabel}
        />
      )}
    >
      <nav className={ui.pills} aria-label={t.sessionView.status}>
        <Link href={listHref(params, { estado: '' })} className={ui.pill} aria-current={params.estado === '' ? 'true' : undefined} scroll={false}>
          {t.common.all}
        </Link>
        <Link href={listHref(params, { estado: 'abiertas' })} className={ui.pill} aria-current={params.estado === 'abiertas' ? 'true' : undefined} scroll={false}>
          {t.sessionView.openCount(openCount)}
        </Link>
      </nav>
      <span className={ui.spacer} />
      <FilterMenu
        align="end"
        label={t.sessionForm.practice}
        text={practice === '' ? t.sessionForm.practice : t.sessionView.practiceFilter(practiceLabel(practice))}
        options={PRACTICES.map((value) => ({
          key: value, href: listHref(params, { practica: value }), current: value === params.practica,
          label: value === '' ? t.sessionView.allPractices : practiceLabel(value),
        }))}
        clear={practice === '' ? undefined : {
          href: listHref(params, { practica: '' }), label: t.errors.removeFilter(practiceLabel(practice)),
        }}
      />
      <Link
        href={listHref(params, { orden: params.orden === 'asc' ? '' : 'asc' })}
        className={ui.filterButton}
        scroll={false}
        aria-label={params.orden === 'asc' ? t.sessionView.sortAsc : t.sessionView.sortDesc}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        {t.sessionForm.date} {params.orden === 'asc' ? '↑' : '↓'}
      </Link>
    </FilterBar>
  );
}
