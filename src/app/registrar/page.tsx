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
import type { SessionRow } from '@/lib/domain/types';
import { KIND_LABELS, PAPER_LABELS, STATUS_LABELS } from '../_shared/labels';
import { toIsoDate } from '@/lib/time/dates';
import { CaptureForm } from './CaptureForm';
import { ErrorList } from './ErrorList';
import { SessionPanel } from './SessionPanel';
import { SessionImport } from './SessionImport';
import { ManualSession } from './ManualSession';
import { SavedNotice } from './SavedNotice';
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
    const open = listOpenSessions(db);
    // Desde /writing, sin sesion libre: se abre el alta con Writing puesto y se vuelve alli.
    const fromWriting = params['nueva'] === 'writing';
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>Registrar</h1>
          <p className={styles.lede}>
            Abre una sesión y vuelca los errores. El objetivo es que cada error cueste
            menos de 30 segundos.
          </p>
        </header>

        {/* Por orden de uso: retomar lo abierto, pegar la tanda de Macmillan y, a un
            clic, la sesion a mano. Mientras se revisa una tanda, solo queda la revision. */}
        <div className={styles.entry}>
          {page === 1 && open.length > 0 && (
            <section className={`${styles.openBlock} ${styles.idleOnly}`} aria-labelledby="open-heading">
              <h2 id="open-heading">Sesiones abiertas</h2>
              <ul className={styles.sessions}>
                {open.map((session) => (
                  <li key={session.id}>
                    {/* Al formulario de captura: retomar una abierta es seguir volcando. */}
                    <SessionLink session={session} href={`/registrar?s=${String(session.id)}#captura`} action="Continuar →" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SessionImport today={today} openSessions={open} subcategorySuggestions={distinctSubcategories(db)} />

          <div className={styles.idleOnly}>
            <ManualSession
              today={today}
              initiallyOpen={fromWriting}
              preset={fromWriting ? { kind: 'WRITING', paper: 'WRITING', part: 1 } : undefined}
              returnTo={fromWriting ? '/writing' : undefined}
            />
          </div>
        </div>

        {recent.length > 0 && (
          <section className={`${styles.recent} ${styles.idleOnly}`} aria-labelledby="recent-heading">
            <h2 id="recent-heading">{page === 1 ? 'Sesiones recientes' : 'Historial de sesiones'}</h2>
            <ul className={styles.sessions}>
              {recent.map((session) => (
                <li key={session.id}>
                  <SessionLink session={session} href={`/registrar?s=${String(session.id)}`} />
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className={styles.pagination} aria-label="Páginas de sesiones">
                {page > 1 && (
                  <Link href={page === 2 ? '/registrar' : `/registrar?p=${String(page - 1)}`}>
                    ← Más recientes
                  </Link>
                )}
                <span>Página {page} de {pages} · {total} sesiones</span>
                {page < pages && (
                  <Link href={`/registrar?p=${String(page + 1)}`}>Más antiguas →</Link>
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
  const rawNotice = params['aviso'];
  const aviso = typeof rawNotice === 'string' ? rawNotice.trim().slice(0, 300) || null : null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.crumb}>
          <Link href="/registrar">← Todas las sesiones</Link>
        </div>

        <h1>
          <span className="data">{active.date}</span>{' '}
          <span className={styles.title}>
            {active.paper === null ? 'Sin formato de examen' : `${PAPER_LABELS[active.paper]} Part ${String(active.part)}`} · {KIND_LABELS[active.kind]}
          </span>
        </h1>

        <SessionPanel session={active} errorCount={errors.length} today={today} />
      </header>

      {aviso !== null && <SavedNotice message={aviso} sessionId={active.id} />}
      {active.status === 'OPEN' ? (
        <CaptureForm
          session={active}
          subcategorySuggestions={subcategories}
          lastCategory={lastUsedCategory(db)}
          autoFocusFirstField={aviso === null}
        />
      ) : (
        <p className={styles.closed}>
          Sesión cerrada. Reábrela para corregirla o añadir errores que faltaran.
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

/**
 * Una sesion en una lista. En el historial, la fila acaba en su estado; en las abiertas,
 * en la accion que lleva a seguir con ella.
 */
function SessionLink({ session, href, action }: {
  readonly session: SessionRow;
  readonly href: string;
  readonly action?: string;
}) {
  return (
    <Link className={styles.sessionLink} href={href}>
      <span className="data">{session.date}</span>
      <span className={styles.meta}>
        {session.paper === null ? 'Sin formato de examen' : `${PAPER_LABELS[session.paper]} P${String(session.part)}`} · {KIND_LABELS[session.kind]}
        {action !== undefined && session.sourceRef !== null && ` · ${session.sourceRef}`}
      </span>
      <span className="data">
        {session.itemsTotal === null
          ? '—'
          : `${String(session.itemsCorrect ?? 0)}/${String(session.itemsTotal)}`}
      </span>
      {action === undefined ? (
        <span className={session.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}>
          {STATUS_LABELS[session.status]}
        </span>
      ) : (
        <span className={styles.action}>{action}</span>
      )}
    </Link>
  );
}
