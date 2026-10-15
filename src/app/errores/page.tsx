import { X } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { type AnkiFilter, distinctSubcategories, getError, getSession, searchErrors } from '@/lib/db/repo';
import { CATEGORIES, CAUSES, CONFIDENCES } from '@/lib/domain/enums';
import { WINDOW_DAYS_OPTIONS } from '@/lib/domain/thresholds';
import { toIsoDate, windowStart } from '@/lib/time/dates';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { getT } from '../_shared/i18nServer';
import { LiveSearch } from '../_shared/LiveSearch';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import type { SearchParams } from '../_shared/window';
import { FiltersToggle } from './FiltersToggle';
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

  const chips: { label: string; remove: string }[] = [
    ...(category === undefined ? [] : [{ label: t.labels.category[category], remove: href({ cat: undefined }) }]),
    ...(cause === undefined ? [] : [{ label: t.labels.cause[cause], remove: href({ causa: undefined }) }]),
    ...(confidence === undefined ? [] : [{ label: t.errors.confidenceChip(t.labels.confidence[confidence]), remove: href({ conf: undefined }) }]),
    ...(anki === undefined ? [] : [{ label: t.errors.ankiChip(t.labels.ankiState[ANKI_FILTERS[anki]]), remove: href({ anki: undefined }) }]),
    ...(days === undefined ? [] : [{ label: t.format.days(days), remove: href({ w: undefined }) }]),
    ...(withItemsOnly ? [{ label: t.errors.withItemsOnly, remove: href({ items: undefined }) }] : []),
  ];
  const filtered = chips.length > 0 || q !== '';

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={ui.pageTitle}>{t.nav.errors}</h1>
        <RouteTabs
          label={t.errors.views}
          items={[
            { href: '/errores', label: t.errors.all, current: true },
            { href: '/certezas', label: t.errors.falseCertainties, current: false },
          ]}
        />
      </div>

      <div className={styles.toolbar}>
        <LiveSearch placeholder={t.errors.searchPlaceholder} label={t.errors.searchLabel} className={styles.search} />
        <FiltersToggle active={chips.length}>
          <form action="/errores" className={styles.filtersForm}>
            {q !== '' && <input type="hidden" name="q" value={q} />}
            {withItemsOnly && <input type="hidden" name="items" value="1" />}
            <div className={ui.field}>
              <label htmlFor="filtro-1">{t.errorForm.category}</label>
              <select id="filtro-1" name="cat" className={ui.select} defaultValue={category ?? ''}>
                <option value="">{t.common.all}</option>
                {CATEGORIES.map((value) => <option key={value} value={value}>{t.labels.category[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-2">{t.errorForm.cause}</label>
              <select id="filtro-2" name="causa" className={ui.select} defaultValue={cause ?? ''}>
                <option value="">{t.common.all}</option>
                {CAUSES.map((value) => <option key={value} value={value}>{t.labels.cause[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-3">{t.errorForm.confidence}</label>
              <select id="filtro-3" name="conf" className={ui.select} defaultValue={confidence ?? ''}>
                <option value="">{t.common.all}</option>
                {CONFIDENCES.map((value) => <option key={value} value={value}>{t.labels.confidence[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-4">Anki</label>
              <select id="filtro-4" name="anki" className={ui.select} defaultValue={anki ?? ''}>
                <option value="">{t.errors.anyStatus}</option>
                {(Object.keys(ANKI_FILTERS) as AnkiFilter[]).map((value) => (
                  <option key={value} value={value}>{t.labels.ankiState[ANKI_FILTERS[value]]}</option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-5">{t.errors.practiceDate}</label>
              <select id="filtro-5" name="w" className={ui.select} defaultValue={days === undefined ? '' : String(days)}>
                <option value="">{t.errors.wholeHistory}</option>
                {WINDOW_DAYS_OPTIONS.map((value) => <option key={value} value={value}>{t.errors.lastDays(value)}</option>)}
              </select>
            </div>
            <div className={styles.filtersActions}>
              <button type="submit" className={ui.primary}>{t.common.applyFilters}</button>
              <Link href={q === '' ? '/errores' : `/errores?q=${encodeURIComponent(q)}`} className={ui.ghost}>{t.common.removeFilters}</Link>
            </div>
          </form>
        </FiltersToggle>
        {chips.map((chip) => (
          <span key={chip.label} className={ui.chip}>
            {chip.label}
            <Link href={chip.remove} className={ui.chipX} aria-label={t.errors.removeFilter(chip.label)} scroll={false}>
              <X size={14} aria-hidden="true" />
            </Link>
          </span>
        ))}
        <span className={ui.spacer} />
        <span className={styles.count}>{t.errors.results(result.total)}</span>
      </div>

      <ErrorExplorer
        key={`${q}|${chips.map((chip) => chip.label).join('|')}|${String(page)}`}
        rows={result.rows}
        mode="global"
        initialSelectedId={Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null}
        outsideSelected={outside}
        subcategorySuggestions={distinctSubcategories(db)}
        caption={t.errors.foundCaption}
        empty={(
          <div className={`${ui.tableEmpty} ${styles.emptyTable}`}>
            {filtered ? (
              <>
                <span>{t.errors.noMatch}</span>
                <Link href="/errores" className={ui.textLink}>{t.common.clearFilters}</Link>
              </>
            ) : (
              <>
                <span>{t.errors.none}</span>
                <Link href="/registrar" className={ui.textLink}>{t.common.goToSessions}</Link>
              </>
            )}
          </div>
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
