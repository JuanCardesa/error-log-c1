import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import {
  distinctSubcategories,
  getSession,
  lastUsedCategory,
  listErrors,
  listSessions,
} from '@/lib/db/repo';
import { toIsoDate } from '@/lib/time/dates';
import { CaptureForm } from './CaptureForm';
import { ErrorList } from './ErrorList';
import { SessionControls } from './SessionControls';
import { SessionForm } from './SessionForm';
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
  const recent = listSessions(db, 12);
  const today = toIsoDate(new Date());

  if (active === null) {
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>Registrar</h1>
          <p className={styles.lede}>
            Abre una sesion y vuelca los errores. El objetivo es que cada error cueste
            menos de 30 segundos.
          </p>
        </header>

        <SessionForm today={today} />

        {recent.length > 0 && (
          <section className={styles.recent} aria-labelledby="recent-heading">
            <h2 id="recent-heading">Sesiones recientes</h2>
            <ul className={styles.sessions}>
              {recent.map((session) => (
                <li key={session.id}>
                  <Link className={styles.sessionLink} href={`/registrar?s=${String(session.id)}`}>
                    <span className="data">{session.date}</span>
                    <span className={styles.meta}>
                      {session.paper} P{session.part} · {session.kind}
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
          </section>
        )}
      </div>
    );
  }

  const errors = listErrors(db, active.id);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.crumb}>
          <Link href="/registrar">← Todas las sesiones</Link>
        </div>

        <h1>
          <span className="data">{active.date}</span>{' '}
          <span className={styles.title}>
            {active.paper} Part {active.part} · {active.kind}
          </span>
        </h1>

        <dl className={styles.facts}>
          <div>
            <dt>Fuente</dt>
            <dd className="data">
              {active.source}
              {active.sourceRef === null ? '' : ` · ${active.sourceRef}`}
            </dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd className="data">
              {active.itemsTotal === null
                ? 'no aplica'
                : `${String(active.itemsCorrect ?? 0)} / ${String(active.itemsTotal)}`}
            </dd>
          </div>
          <div>
            <dt>Cronometro</dt>
            <dd className="data">{active.timed ? 'si' : 'no'}</dd>
          </div>
          <div>
            <dt>Errores</dt>
            <dd className="data">{errors.length}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span
                className={active.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}
              >
                {active.status}
              </span>
            </dd>
          </div>
        </dl>

        <SessionControls session={active} errorCount={errors.length} />
      </header>

      {active.status === 'OPEN' ? (
        <CaptureForm
          session={active}
          subcategorySuggestions={distinctSubcategories(db)}
          lastCategory={lastUsedCategory(db)}
        />
      ) : (
        <p className={styles.closed}>
          Sesion cerrada. Reabrela para corregirla o añadir errores que faltaran.
        </p>
      )}

      <ErrorList errors={errors} />
    </div>
  );
}
