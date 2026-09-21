import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import {
  distinctSubcategories,
  countSessions,
  getSession,
  lastUsedCategory,
  listErrors,
  listSessions,
  listOpenSessions,
} from '@/lib/db/repo';
import { toIsoDate } from '@/lib/time/dates';
import { CaptureForm } from './CaptureForm';
import { ErrorList } from './ErrorList';
import { SessionForm } from './SessionForm';
import { SessionPanel } from './SessionPanel';
import { SessionImport } from './SessionImport';
import styles from './page.module.css';

/**
 * Vista Registrar. Componente de servidor: lee de SQLite y baja a cliente solo los
 * formularios, que son lo unico que necesita estado.
 *
 * El flujo respeta §6.1: primero una cabecera valida, y solo entonces aparece la
 * entrada de errores.
 */

export const dynamic = 'force-dynamic';

interface Props {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseId(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function RegistrarPage({ searchParams }: Props) {
  const params = await searchParams;
  const db = getDb();

  const activeId = parseId(params['s']);
  const active = activeId === null ? null : getSession(db, activeId);
  const today = toIsoDate(new Date());

  if (active === null) {
    const pageSize = 12;
    const total = countSessions(db);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parseId(params['p']) ?? 1, pages);
    const recent = listSessions(db, pageSize, (page - 1) * pageSize);
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>Registrar</h1>
          <p className={styles.lede}>
            Abre una sesion y vuelca los errores. El objetivo es que cada error cueste
            menos de 30 segundos.
          </p>
        </header>

        <SessionImport today={today} openSessions={listOpenSessions(db)} subcategorySuggestions={distinctSubcategories(db)} />
        <SessionForm today={today} />

        {recent.length > 0 && (
          <section className={styles.recent} aria-labelledby="recent-heading">
            <h2 id="recent-heading">{page === 1 ? 'Sesiones recientes' : 'Historial de sesiones'}</h2>
            <ul className={styles.sessions}>
              {recent.map((session) => (
                <li key={session.id}>
                  <Link className={styles.sessionLink} href={`/registrar?s=${String(session.id)}`}>
                    <span className="data">{session.date}</span>
                    <span className={styles.meta}>
                      {session.paper === null ? 'Sin formato de examen' : `${session.paper} P${String(session.part)}`} · {session.kind}
                    </span>
                    <span className="data">
                      {session.itemsTotal === null
                        ? '—'
                        : `${String(session.itemsCorrect ?? 0)}/${String(session.itemsTotal)}`}
                    </span>
                    <span
                      className={
                        session.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed
                      }
                    >
                      {session.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className={styles.pagination} aria-label="Paginas de sesiones">
                {page > 1 && (
                  <Link href={page === 2 ? '/registrar' : `/registrar?p=${String(page - 1)}`}>
                    ← Mas recientes
                  </Link>
                )}
                <span>Pagina {page} de {pages} · {total} sesiones</span>
                {page < pages && (
                  <Link href={`/registrar?p=${String(page + 1)}`}>Mas antiguas →</Link>
                )}
              </nav>
            )}
          </section>
        )}
      </div>
    );
  }

  const errors = listErrors(db, active.id);
  const subcategories = distinctSubcategories(db);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.crumb}>
          <Link href="/registrar">← Todas las sesiones</Link>
        </div>

        <h1>
          <span className="data">{active.date}</span>{' '}
          <span className={styles.title}>
            {active.paper === null ? 'Sin formato de examen' : `${active.paper} Part ${String(active.part)}`} · {active.kind}
          </span>
        </h1>

        <SessionPanel session={active} errorCount={errors.length} today={today} />
      </header>

      {active.status === 'OPEN' ? (
        <CaptureForm
          session={active}
          subcategorySuggestions={subcategories}
          lastCategory={lastUsedCategory(db)}
        />
      ) : (
        <p className={styles.closed}>
          Sesion cerrada. Reabrela para corregirla o añadir errores que faltaran.
        </p>
      )}

      <ErrorList
        errors={errors}
        session={active}
        subcategorySuggestions={subcategories}
      />
    </div>
  );
}
