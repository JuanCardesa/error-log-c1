import { X } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { type AnkiFilter, distinctSubcategories, getError, getSession, searchErrors } from '@/lib/db/repo';
import { CATEGORIES, CAUSES, CONFIDENCES } from '@/lib/domain/enums';
import { WINDOW_DAYS_OPTIONS } from '@/lib/domain/thresholds';
import { toIsoDate, windowStart } from '@/lib/time/dates';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { CATEGORY_LABELS, CAUSE_LABELS, CONFIDENCE_LABELS } from '../_shared/labels';
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

const ANKI_FILTERS: Readonly<Record<AnkiFilter, string>> = {
  pendiente: 'Anki: pendiente',
  convertida: 'Anki: convertida',
  'no-aplica': 'Anki: no aplica',
};

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');
const pick = <T extends string>(list: readonly T[], value: string): T | undefined => list.find((item) => item === value);

export default async function ErroresPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
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
    ...(category === undefined ? [] : [{ label: CATEGORY_LABELS[category], remove: href({ cat: undefined }) }]),
    ...(cause === undefined ? [] : [{ label: CAUSE_LABELS[cause], remove: href({ causa: undefined }) }]),
    ...(confidence === undefined ? [] : [{ label: `Confianza: ${CONFIDENCE_LABELS[confidence]}`, remove: href({ conf: undefined }) }]),
    ...(anki === undefined ? [] : [{ label: ANKI_FILTERS[anki], remove: href({ anki: undefined }) }]),
    ...(days === undefined ? [] : [{ label: `${String(days)} días`, remove: href({ w: undefined }) }]),
    ...(withItemsOnly ? [{ label: 'Solo sesiones con ítems', remove: href({ items: undefined }) }] : []),
  ];
  const filtered = chips.length > 0 || q !== '';

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={ui.pageTitle}>Errores</h1>
        <RouteTabs
          label="Vistas de errores"
          items={[
            { href: '/errores', label: 'Todos', current: true },
            { href: '/certezas', label: 'Falsas certezas', current: false },
          ]}
        />
      </div>

      <div className={styles.toolbar}>
        <LiveSearch placeholder="Buscar en respuestas, enunciados y reglas…" label="Buscar errores" className={styles.search} />
        <FiltersToggle active={chips.length}>
          <form action="/errores" className={styles.filtersForm}>
            {q !== '' && <input type="hidden" name="q" value={q} />}
            {withItemsOnly && <input type="hidden" name="items" value="1" />}
            <div className={ui.field}>
              <label htmlFor="filtro-1">Categoría</label>
              <select id="filtro-1" name="cat" className={ui.select} defaultValue={category ?? ''}>
                <option value="">Todas</option>
                {CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-2">Causa</label>
              <select id="filtro-2" name="causa" className={ui.select} defaultValue={cause ?? ''}>
                <option value="">Todas</option>
                {CAUSES.map((value) => <option key={value} value={value}>{CAUSE_LABELS[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-3">Confianza</label>
              <select id="filtro-3" name="conf" className={ui.select} defaultValue={confidence ?? ''}>
                <option value="">Todas</option>
                {CONFIDENCES.map((value) => <option key={value} value={value}>{CONFIDENCE_LABELS[value]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-4">Anki</label>
              <select id="filtro-4" name="anki" className={ui.select} defaultValue={anki ?? ''}>
                <option value="">Cualquier estado</option>
                <option value="pendiente">Pendiente</option>
                <option value="convertida">Convertida</option>
                <option value="no-aplica">No aplica</option>
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="filtro-5">Fecha de práctica</label>
              <select id="filtro-5" name="w" className={ui.select} defaultValue={days === undefined ? '' : String(days)}>
                <option value="">Todo el historial</option>
                {WINDOW_DAYS_OPTIONS.map((value) => <option key={value} value={value}>Últimos {value} días</option>)}
              </select>
            </div>
            <div className={styles.filtersActions}>
              <button type="submit" className={ui.primary}>Aplicar filtros</button>
              <Link href={q === '' ? '/errores' : `/errores?q=${encodeURIComponent(q)}`} className={ui.ghost}>Quitar filtros</Link>
            </div>
          </form>
        </FiltersToggle>
        {chips.map((chip) => (
          <span key={chip.label} className={ui.chip}>
            {chip.label}
            <Link href={chip.remove} className={ui.chipX} aria-label={`Quitar filtro ${chip.label}`} scroll={false}>
              <X size={14} aria-hidden="true" />
            </Link>
          </span>
        ))}
        <span className={ui.spacer} />
        <span className={styles.count}>{result.total} {result.total === 1 ? 'resultado' : 'resultados'}</span>
      </div>

      <ErrorExplorer
        key={`${q}|${chips.map((chip) => chip.label).join('|')}|${String(page)}`}
        rows={result.rows}
        mode="global"
        initialSelectedId={Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null}
        outsideSelected={outside}
        subcategorySuggestions={distinctSubcategories(db)}
        caption="Errores encontrados"
        empty={(
          <div className={`${ui.tableEmpty} ${styles.emptyTable}`}>
            {filtered ? (
              <>
                <span>Ningún error coincide con la búsqueda y los filtros activos.</span>
                <Link href="/errores" className={ui.textLink}>Limpiar filtros</Link>
              </>
            ) : (
              <>
                <span>Todavía no hay errores. Aparecerán aquí al guardar tu primera sesión.</span>
                <Link href="/registrar" className={ui.textLink}>Ir a Sesiones</Link>
              </>
            )}
          </div>
        )}
      />

      {pages > 1 && (
        <nav className={styles.pagination} aria-label="Páginas de errores">
          {page > 1 ? <Link href={href({ p: String(page - 1) })}>Anteriores</Link> : <span className={styles.pageDisabled}>Anteriores</span>}
          <span className={styles.pageNow}>{page} / {pages}</span>
          {page < pages ? <Link href={href({ p: String(page + 1) })}>Siguientes</Link> : <span className={styles.pageDisabled}>Siguientes</span>}
        </nav>
      )}
    </div>
  );
}
