'use client';

import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

import { GENRES, type Genre } from '@/lib/domain/enums';
import { LIBRARY_SORTS, type LibraryQuery, type LibraryStatus } from '@/lib/writing/library';
import { FilterBar } from '../_shared/FilterBar';
import { FilterMenu } from '../_shared/FilterMenu';
import { useT } from '../_shared/i18nClient';
import { LiveSearch } from '../_shared/LiveSearch';
import ui from '../_shared/ui.module.css';
import { libraryHref } from './libraryParams';
import styles from './writing.module.css';

/**
 * Búsqueda, estado, tipo y orden de la biblioteca. La búsqueda filtra al escribir; el resto
 * son enlaces, así que cada vista tiene su URL.
 */
export function LibraryToolbar({ query, counts }: {
  readonly query: LibraryQuery;
  /** Pendientes y corregidas entre lo que cumple la búsqueda y el tipo. */
  readonly counts: Readonly<Record<LibraryStatus, number>>;
}) {
  const t = useT();
  const w = t.writing;
  const statuses: readonly { readonly value: LibraryStatus | null; readonly label: string }[] = [
    { value: null, label: t.common.all },
    { value: 'AWAITING', label: w.awaitingCount(counts.AWAITING) },
    { value: 'CORRECTED', label: w.correctedCount(counts.CORRECTED) },
  ];
  const genreLabel = (genre: Genre | null) => (genre === null ? w.allTypes : t.labels.genre[genre]);

  return (
    <FilterBar search={<LiveSearch placeholder={w.searchPlaceholder} label={w.searchLabel} className={ui.filterSearch} maxLength={200} />}>
      <nav className={ui.pills} aria-label={w.statusFilter}>
        {statuses.map((status) => (
          <Link key={status.value ?? 'all'} href={libraryHref(query, { status: status.value })} className={ui.pill}
            aria-current={query.status === status.value ? 'true' : undefined} scroll={false}>
            {status.label}
          </Link>
        ))}
      </nav>
      {/* Tipo y orden van juntos: si no caben, bajan los dos a la línea siguiente. */}
      <div className={styles.toolbarMenus}>
        <FilterMenu
          align="end"
          label={w.typeFilterLabel}
          text={query.genre === null ? w.typeFilterLabel : w.typeFilter(genreLabel(query.genre))}
          options={[null, ...GENRES].map((genre) => ({
            key: genre ?? 'all', href: libraryHref(query, { genre }), current: query.genre === genre, label: genreLabel(genre),
          }))}
          clear={query.genre === null ? undefined : {
            href: libraryHref(query, { genre: null }), label: t.errors.removeFilter(genreLabel(query.genre)),
          }}
        />
        <FilterMenu
          align="end"
          label={w.sortLabel}
          text={w.sort[query.sort]}
          icon={<ArrowUpDown size={16} aria-hidden="true" />}
          options={LIBRARY_SORTS.map((sort) => ({
            key: sort, href: libraryHref(query, { sort }), current: query.sort === sort, label: w.sort[sort],
          }))}
        />
      </div>
    </FilterBar>
  );
}
