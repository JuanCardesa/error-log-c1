import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { distinctSubcategories } from '@/lib/db/repo';
import { FIXED_WINDOW_DAYS } from '@/lib/domain/thresholds';
import { q4FalseCertainties } from '@/lib/queries/q4FalseCertainties';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { LiveSearch } from '../_shared/LiveSearch';
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
      <div className={styles.head}>
        <h1 className={ui.pageTitle}>Errores</h1>
        <RouteTabs
          label="Vistas de errores"
          items={[
            { href: '/errores', label: 'Todos', current: false },
            { href: '/certezas', label: 'Falsas certezas', current: true },
          ]}
        />
      </div>
      <p className={styles.intro}>
        Errores registrados con confianza «Seguro» · <strong>últimos {FIXED_WINDOW_DAYS} días, periodo fijo</strong>.
        Incluye despistes: no todos implican desconocer la regla.
      </p>

      <div className={styles.toolbar}>
        <LiveSearch placeholder="Buscar en respuestas, enunciados y reglas…" label="Buscar falsas certezas" className={styles.search} />
        <span className={ui.spacer} />
        <span className={styles.count}>
          {rows.length} {rows.length === 1 ? 'caso' : 'casos'} · últimos {FIXED_WINDOW_DAYS} días
        </span>
      </div>

      <ErrorExplorer
        key={q}
        rows={rows}
        mode="global"
        initialSelectedId={Number.isInteger(selected) && selected > 0 ? selected : null}
        subcategorySuggestions={distinctSubcategories(db)}
        caption="Falsas certezas de los últimos 30 días"
        empty={(
          <div className={`${ui.tableEmpty} ${styles.emptyTable}`}>
            {q !== '' ? (
              <>
                <span>Ningún caso coincide con «{q}».</span>
                <Link href="/certezas" className={ui.textLink}>Limpiar búsqueda</Link>
              </>
            ) : data.errors.length === 0 ? (
              <>
                <span>Todavía no hay errores registrados.</span>
                <Link href="/registrar" className={ui.textLink}>Ir a Sesiones</Link>
              </>
            ) : (
              <span>Sin errores registrados con confianza «Seguro» en {FIXED_WINDOW_DAYS} días.</span>
            )}
          </div>
        )}
      />
    </div>
  );
}
