import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { distinctSubcategories } from '@/lib/db/repo';
import { FIXED_WINDOW_DAYS } from '@/lib/domain/thresholds';
import { q4FalseCertainties } from '@/lib/queries/q4FalseCertainties';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { EmptyState } from '../_shared/EmptyState';
import { FilterBar } from '../_shared/FilterBar';
import { getT } from '../_shared/i18nServer';
import { LiveSearch } from '../_shared/LiveSearch';
import { PageHeader } from '../_shared/PageHeader';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import type { SearchParams } from '../_shared/window';
import styles from '../errores/errores.module.css';

/**
 * Q4 · Falsas certezas: errores registrados con confianza «Seguro». Periodo fijo de 30
 * días (decisión P2), sin conmutador. Incluye despistes: no todos implican desconocer la
 * regla, y la vista no lo diagnostica por su cuenta.
 */

export const dynamic = 'force-dynamic';

export default async function CertezasPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const q = typeof params['q'] === 'string' ? params['q'].trim().toLowerCase() : '';
  const selected = Number(typeof params['error'] === 'string' ? params['error'] : '');
  const db = getDb();
  const data = loadDataset(db);
  const errorById = new Map(data.errors.map((error) => [error.id, error]));
  const sessionById = new Map(data.sessions.map((session) => [session.id, session]));

  const all: ExplorerRow[] = q4FalseCertainties(data, { now: new Date() }).flatMap((row) => {
    const error = errorById.get(row.errorId);
    const session = error === undefined ? undefined : sessionById.get(error.sessionId);
    return error === undefined || session === undefined ? [] : [{ error, session }];
  });
  const rows = q === '' ? all : all.filter(({ error }) =>
    `${error.prompt} ${error.myAnswer ?? ''} ${error.correctAnswer} ${error.ruleNote}`.toLowerCase().includes(q));

  return (
    <div className={styles.page}>
      <PageHeader
        title={t.nav.errors}
        tabs={(
          <RouteTabs
            label={t.errors.views}
            items={[
              { href: '/errores', label: t.errors.all, current: false },
              { href: '/certezas', label: t.errors.falseCertainties, current: true },
            ]}
          />
        )}
      />
      <p className={styles.intro}>
        {t.certainties.introBefore}<strong>{t.certainties.introStrong(FIXED_WINDOW_DAYS)}</strong>{t.certainties.introAfter}
      </p>

      <FilterBar
        search={<LiveSearch placeholder={t.errors.searchPlaceholder} label={t.certainties.searchLabel} className={ui.filterSearch} />}
        aside={t.certainties.count(rows.length, FIXED_WINDOW_DAYS)}
      />

      <ErrorExplorer
        key={q}
        rows={rows}
        mode="global"
        initialSelectedId={Number.isInteger(selected) && selected > 0 ? selected : null}
        subcategorySuggestions={distinctSubcategories(db)}
        caption={t.certainties.caption(FIXED_WINDOW_DAYS)}
        empty={(
          q !== '' ? (
            <EmptyState cause={t.certainties.noMatch(q)} action={<Link href="/certezas" className={ui.textLink}>{t.common.clearSearch}</Link>} />
          ) : data.errors.length === 0 ? (
            <EmptyState cause={t.certainties.noErrors} action={<Link href="/registrar" className={ui.textLink}>{t.common.goToSessions}</Link>} />
          ) : (
            <EmptyState cause={t.certainties.noneSure(FIXED_WINDOW_DAYS)} />
          )
        )}
      />
    </div>
  );
}
