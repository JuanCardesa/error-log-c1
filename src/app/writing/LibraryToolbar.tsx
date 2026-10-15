'use client';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
import Link from 'next/link';

import { GENRES, type Genre } from '@/lib/domain/enums';
import { LIBRARY_SORTS, type LibraryQuery, type LibraryStatus } from '@/lib/writing/library';
import { useT } from '../_shared/i18nClient';
import { LiveSearch } from '../_shared/LiveSearch';
import { Menu } from '../_shared/Menu';
import overlay from '../_shared/overlay.module.css';
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
    <div className={styles.toolbar}>
      <LiveSearch placeholder={w.searchPlaceholder} label={w.searchLabel} className={styles.search} maxLength={200} />
      <nav className={ui.pills} aria-label={w.statusFilter}>
        {statuses.map((status) => (
          <Link key={status.value ?? 'all'} href={libraryHref(query, { status: status.value })} className={ui.pill}
            aria-current={query.status === status.value ? 'true' : undefined} scroll={false}>
            {status.label}
          </Link>
        ))}
      </nav>
      <div className={styles.toolbarMenus}>
        <Menu
          label={w.typeFilterLabel}
          trigger={(props) => (
            <button type="button" {...props} className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}>
              {w.typeFilter(genreLabel(query.genre))}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        >
          {(close) => [null, ...GENRES].map((genre) => (
            <Link key={genre ?? 'all'} role="menuitem" href={libraryHref(query, { genre })} className={overlay.menuItem}
              aria-current={query.genre === genre ? 'page' : undefined} onClick={close} scroll={false}>
              {genreLabel(genre)}
            </Link>
          ))}
        </Menu>
        <Menu
          label={w.sortLabel}
          trigger={(props) => (
            <button type="button" {...props} className={`${ui.ghost} ${ui.compact} ${styles.filterButton}`}>
              <ArrowUpDown size={16} aria-hidden="true" />
              {w.sort[query.sort]}
            </button>
          )}
        >
          {(close) => LIBRARY_SORTS.map((sort) => (
            <Link key={sort} role="menuitem" href={libraryHref(query, { sort })} className={overlay.menuItem}
              aria-current={query.sort === sort ? 'page' : undefined} onClick={close} scroll={false}>
              {w.sort[sort]}
            </Link>
          ))}
        </Menu>
      </div>
    </div>
  );
}
