import { X } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { type AnkiFilter, distinctSubcategories, getError, getSession, searchErrors } from '@/lib/db/repo';
import { CATEGORIES, CAUSES, CONFIDENCES } from '@/lib/domain/enums';
import { WINDOW_DAYS_OPTIONS } from '@/lib/domain/thresholds';
import { toIsoDate, windowStart } from '@/lib/time/dates';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { EmptyState } from '../_shared/EmptyState';
import { FilterBar } from '../_shared/FilterBar';
import { FilterMenu } from '../_shared/FilterMenu';
import { getT } from '../_shared/i18nServer';
import { LiveSearch } from '../_shared/LiveSearch';
import { PageHeader } from '../_shared/PageHeader';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import type { SearchParams } from '../_shared/window';
import styles from './errores.module.css';

/**
 * Errores: encontrar y revisar un fallo sin recordar en qué sesión se registró. La
 * consulta es de solo lectura y paginada en el servidor; filtros, página y error
 * seleccionado viven en la URL para poder enlazarlos desde Progreso, Anki o la búsqueda.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

/** El valor de `?anki=` y el estado que nombra. */
const ANKI_FILTERS = { pendiente: 'PENDING', convertida: 'CONVERTED', 'no-aplica': 'NOT_APPLICABLE' } as const satisfies Record<AnkiFilter, string>;

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');
const pick = <T extends string>(list: readonly T[], value: string): T | undefined => list.find((item) => item === value);

export default async function ErroresPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const q = one(params['q']).slice(0, 200);
  const category = pick(CATEGORIES, one(params['cat']));
  const cause = pick(CAUSES, one(params['causa']));
  const confidence = pick(CONFIDENCES, one(params['conf']));
  const anki = pick(['pendiente', 'convertida', 'no-aplica'] as const, one(params['anki']));
  const days = WINDOW_DAYS_OPTIONS.find((value) => String(value) === one(params['w']));
  const withItemsOnly = one(params['items']) === '1';
  const requestedPage = Number(one(params['p']));
  const selectedId = Number(one(params['error']));

  const now = new Date();
  const db = getDb();
  const filters = {
    q,
    category,
    cause,
    confidence,
    anki,
    from: days === undefined ? undefined : windowStart(now, days),
    to: days === undefined ? undefined : toIsoDate(now),
    withItemsOnly,
  };
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let result = searchErrors(db, { ...filters, limit: PAGE_SIZE, offset: (pageNumber - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(pageNumber, pages);
  if (page !== pageNumber) result = searchErrors(db, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  // Un error pedido por enlace que no cae en esta página también se abre.
  let outside: ExplorerRow | null = null;
  if (Number.isInteger(selectedId) && selectedId > 0 && !result.rows.some((row) => row.error.id === selectedId)) {
    const error = getError(db, selectedId);
    const session = error === null ? null : getSession(db, error.sessionId);
    if (error !== null && session !== null) outside = { error, session };
  }

  const href = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: q || undefined, cat: category, causa: cause, conf: confidence, anki,
      w: days === undefined ? undefined : String(days), items: withItemsOnly ? '1' : undefined,
    };
    for (const [key, value] of Object.entries({ ...base, ...overrides })) if (value !== undefined && value !== '') next.set(key, value);
    const text = next.toString();
    return text === '' ? '/errores' : `/errores?${text}`;
  };

  const filtered = q !== '' || category !== undefined || cause !== undefined || confidence !== undefined
    || anki !== undefined || days !== undefined || withItemsOnly;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t.nav.errors}
        tabs={(
          <RouteTabs
            label={t.errors.views}
            items={[
              { href: '/errores', label: t.errors.all, current: true },
              { href: '/certezas', label: t.errors.falseCertainties, current: false },
            ]}
          />
        )}
      />

      <FilterBar
        search={<LiveSearch placeholder={t.errors.searchPlaceholder} label={t.errors.searchLabel} className={ui.filterSearch} />}
        aside={t.errors.results(result.total)}
      >
        <FilterMenu
          label={t.errorForm.category}
          text={category === undefined ? t.errorForm.category : t.common.filterValue(t.errorForm.category, t.labels.category[category])}
          options={[undefined, ...CATEGORIES].map((value) => ({
            key: value ?? 'all', href: href({ cat: value }), current: value === category,
            label: value === undefined ? t.common.all : t.labels.category[value],
          }))}
          clear={category === undefined ? undefined : { href: href({ cat: undefined }), label: t.errors.removeFilter(t.labels.category[category]) }}
        />
        <FilterMenu
          label={t.errorForm.cause}
          text={cause === undefined ? t.errorForm.cause : t.common.filterValue(t.errorForm.cause, t.labels.cause[cause])}
          options={[undefined, ...CAUSES].map((value) => ({
            key: value ?? 'all', href: href({ causa: value }), current: value === cause,
            label: value === undefined ? t.common.all : t.labels.cause[value],
          }))}
          clear={cause === undefined ? undefined : { href: href({ causa: undefined }), label: t.errors.removeFilter(t.labels.cause[cause]) }}
        />
        <FilterMenu
          label={t.errorForm.confidence}
          text={confidence === undefined ? t.errorForm.confidence : t.common.filterValue(t.errorForm.confidence, t.labels.confidence[confidence])}
          options={[undefined, ...CONFIDENCES].map((value) => ({
            key: value ?? 'all', href: href({ conf: value }), current: value === confidence,
            label: value === undefined ? t.common.all : t.labels.confidence[value],
          }))}
          clear={confidence === undefined ? undefined : {
            href: href({ conf: undefined }), label: t.errors.removeFilter(t.errors.confidenceChip(t.labels.confidence[confidence])),
          }}
        />
        <FilterMenu
          label="Anki"
          text={anki === undefined ? 'Anki' : t.common.filterValue('Anki', t.labels.ankiState[ANKI_FILTERS[anki]])}
          options={[undefined, ...(Object.keys(ANKI_FILTERS) as AnkiFilter[])].map((value) => ({
            key: value ?? 'all', href: href({ anki: value }), current: value === anki,
            label: value === undefined ? t.errors.anyStatus : t.labels.ankiState[ANKI_FILTERS[value]],
          }))}
          clear={anki === undefined ? undefined : {
            href: href({ anki: undefined }), label: t.errors.removeFilter(t.errors.ankiChip(t.labels.ankiState[ANKI_FILTERS[anki]])),
          }}
        />
        <FilterMenu
          label={t.errors.practiceDate}
          text={days === undefined ? t.errors.practiceDate : t.common.filterValue(t.errors.practiceDate, t.errors.lastDays(days))}
          options={[undefined, ...WINDOW_DAYS_OPTIONS].map((value) => ({
            key: value === undefined ? 'all' : String(value), href: href({ w: value === undefined ? undefined : String(value) }), current: value === days,
            label: value === undefined ? t.errors.wholeHistory : t.errors.lastDays(value),
          }))}
          clear={days === undefined ? undefined : { href: href({ w: undefined }), label: t.errors.removeFilter(t.format.days(days)) }}
        />
        {withItemsOnly && (
          <span className={ui.chip}>
            {t.errors.withItemsOnly}
            <Link href={href({ items: undefined })} className={ui.chipX} aria-label={t.errors.removeFilter(t.errors.withItemsOnly)} scroll={false}>
              <X size={14} aria-hidden="true" />
            </Link>
          </span>
        )}
      </FilterBar>

      <ErrorExplorer
        key={href({ p: String(page) })}
        rows={result.rows}
        mode="global"
        initialSelectedId={Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null}
        outsideSelected={outside}
        subcategorySuggestions={distinctSubcategories(db)}
        caption={t.errors.foundCaption}
        empty={(
          filtered ? (
            <EmptyState cause={t.errors.noMatch} action={<Link href="/errores" className={ui.textLink}>{t.common.clearFilters}</Link>} />
          ) : (
            <EmptyState cause={t.errors.none} action={<Link href="/registrar" className={ui.textLink}>{t.common.goToSessions}</Link>} />
          )
        )}
      />

      {pages > 1 && (
        <nav className={styles.pagination} aria-label={t.errors.pages}>
          {page > 1 ? <Link href={href({ p: String(page - 1) })}>{t.common.listPrevious}</Link> : <span className={styles.pageDisabled}>{t.common.listPrevious}</span>}
          <span className={styles.pageNow}>{page} / {pages}</span>
          {page < pages ? <Link href={href({ p: String(page + 1) })}>{t.common.listNext}</Link> : <span className={styles.pageDisabled}>{t.common.listNext}</span>}
        </nav>
      )}
    </div>
  );
}
