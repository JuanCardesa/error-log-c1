import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import {
  countOpenSessions,
  distinctSubcategories,
  getSession,
  lastUsedCategory,
  listErrors,
  listOpenSessions,
  searchSessions,
  sessionDeletionImpact,
} from '@/lib/db/repo';
import { PAPERS, SOURCES } from '@/lib/domain/enums';
import type { SessionRow } from '@/lib/domain/types';
import { toIsoDate } from '@/lib/time/dates';
import { Kbd } from '../_shared/Kbd';
import { longDate, practiceLabel, practiceLongLabel, score, sessionTitle, shortDate } from '../_shared/format';
import { SOURCE_LABELS } from '../_shared/labels';
import { StatusText } from '../_shared/StatusText';
import ui from '../_shared/ui.module.css';
import type { SearchParams } from '../_shared/window';
import { BackToList, RememberList } from './BackToList';
import { ImportHost } from './ImportHost';
import { type ListParams, hasFilters, listHref, parseListParams } from './listParams';
import { ManualSession } from './ManualSession';
import { PasteEntry } from './PasteEntry';
import { SavedNotice } from './SavedNotice';
import { SessionControls } from './SessionControls';
import { SessionErrors } from './SessionErrors';
import { SessionTable } from './SessionTable';
import { SessionsToolbar } from './SessionsToolbar';
import styles from './sessions.module.css';

/**
 * Sesiones: registrar la práctica terminada y encontrar cualquier sesión anterior.
 * Con `?s=ID`, el detalle de una sesión y sus errores.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

function parseId(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function RegistrarPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const today = toIsoDate(new Date());
  const rawId = params['s'];

  if (rawId !== undefined) {
    const id = parseId(rawId);
    const session = id === null ? null : getSession(getDb(), id);
    if (session === null) return <SessionNotFound />;
    return <SessionDetail session={session} params={params} today={today} />;
  }
  return <SessionList params={parseListParams(params)} fromWriting={params['nueva'] === 'writing'} newSession={params['nueva'] === '1'} today={today} />;
}

function SessionList({ params, fromWriting, newSession, today }: {
  readonly params: ListParams;
  readonly fromWriting: boolean;
  readonly newSession: boolean;
  readonly today: string;
}) {
  const db = getDb();
  const q = params.q.toLowerCase();
  const sources = q === '' ? [] : SOURCES.filter((source) => SOURCE_LABELS[source].toLowerCase().includes(q));
  const paper = params.practica === 'libre' ? 'NONE' as const : PAPERS.find((value) => value === params.practica);
  const filters = {
    q: params.q,
    sources,
    status: params.estado === 'abiertas' ? 'OPEN' as const : undefined,
    paper,
    order: params.orden === 'asc' ? 'asc' as const : 'desc' as const,
  };
  const firstPass = searchSessions(db, { ...filters, limit: PAGE_SIZE, offset: (params.p - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(firstPass.total / PAGE_SIZE));
  const page = Math.min(params.p, pages);
  const { rows, total } = page === params.p ? firstPass : searchSessions(db, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const openCount = countOpenSessions(db);
  const filtered = hasFilters(params);
  const empty = total === 0 && !filtered;

  return (
    <ImportHost key="lista" today={today} openSessions={listOpenSessions(db)} subcategorySuggestions={distinctSubcategories(db)}>
      <RememberList />
      <div className={styles.page}>
        <header className={ui.pageHead}>
          <div>
            <h1 className={ui.pageTitle}>Sesiones</h1>
            <p className={ui.lede}>Registrar práctica y consultar tu historial</p>
          </div>
          <ManualSession
            today={today}
            shortcut
            initiallyOpen={fromWriting || newSession}
            preset={fromWriting ? { kind: 'WRITING', paper: 'WRITING', part: 1 } : undefined}
            returnTo={fromWriting ? '/writing?registrar=1&sesion={id}' : undefined}
          />
        </header>

        <section id="pegar" aria-label="Importar correcciones">
          <PasteEntry variant="entry" globalPaste />
        </section>

        {empty ? (
          <section className={styles.empty} aria-labelledby="empty-heading">
            <h2 id="empty-heading" className={ui.sectionTitle}>Aún no hay sesiones</h2>
            <p>Pega una tanda corregida o crea una sesión manual. Las sesiones sin errores también cuentan.</p>
          </section>
        ) : (
          <section className={styles.history} aria-label="Historial de sesiones">
            <SessionsToolbar params={params} openCount={openCount} />
            {rows.length === 0 ? (
              <div className={`${ui.tableEmpty} ${styles.table}`}>
                <span>{params.q === '' ? 'Ninguna sesión coincide con los filtros.' : `Ninguna sesión coincide con «${params.q}».`}</span>
                <Link href="/registrar" className={ui.textLink}>Limpiar búsqueda</Link>
              </div>
            ) : (
              <SessionTable rows={rows.map((row) => ({
                id: row.id,
                href: `/registrar?s=${String(row.id)}`,
                date: shortDate(row.date),
                title: sessionTitle(row),
                source: SOURCE_LABELS[row.source],
                practice: practiceLabel(row),
                score: score(row),
                errors: row.errorCount,
                status: row.status,
              }))} />
            )}
            {pages > 1 && (
              <nav className={styles.pagination} aria-label="Páginas de sesiones">
                {page > 1
                  ? <Link href={listHref(params, { p: page - 1 })}>Anteriores</Link>
                  : <span className={styles.pageDisabled}>Anteriores</span>}
                <span className={styles.pageNow}>{page} / {pages}</span>
                {page < pages
                  ? <Link href={listHref(params, { p: page + 1 })}>Siguientes</Link>
                  : <span className={styles.pageDisabled}>Siguientes</span>}
              </nav>
            )}
            <div className={styles.shortcuts} aria-hidden="true">
              <span><Kbd>J</Kbd><Kbd>K</Kbd>moverse</span>
              <span><Kbd>↵</Kbd>abrir</span>
              <span><Kbd>N</Kbd>nueva sesión</span>
              <span><Kbd>G</Kbd><Kbd>E</Kbd>ir a Errores</span>
            </div>
          </section>
        )}
      </div>
    </ImportHost>
  );
}

function SessionDetail({ session, params, today }: {
  readonly session: SessionRow;
  readonly params: SearchParams;
  readonly today: string;
}) {
  const db = getDb();
  const errors = listErrors(db, session.id);
  const subcategories = distinctSubcategories(db);
  const rawNotice = params['aviso'];
  const notice = typeof rawNotice === 'string' ? rawNotice.trim().slice(0, 300) || null : null;
  const errorId = parseId(params['error']);
  const capture = params['modo'] === 'captura';
  const open = session.status === 'OPEN';

  return (
    <ImportHost
      key={`s${String(session.id)}`}
      today={today}
      openSessions={[]}
      fixedTarget={open ? session : null}
      subcategorySuggestions={subcategories}
    >
      <div className={styles.detail}>
        <BackToList />
        <header className={styles.detailHead}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={ui.pageTitle}>{sessionTitle(session)}</h1>
              <StatusText status={session.status} />
            </div>
            <div className={styles.facts}>
              <span>{longDate(session.date)}</span>
              <span>{practiceLongLabel(session)}</span>
              <span>{SOURCE_LABELS[session.source]}</span>
              <span className={styles.factStrong}>
                {session.itemsTotal === null ? 'Sin recuento de ítems (Writing)' : `${score(session)} aciertos`}
              </span>
            </div>
            {!open && <span className={ui.help}>Cerrada para añadir. Puedes corregir los datos existentes.</span>}
          </div>
          <SessionControls session={session} impact={sessionDeletionImpact(db, session.id)} today={today} />
        </header>

        {notice !== null && <SavedNotice message={notice} sessionId={session.id} />}

        <SessionErrors
          session={session}
          rows={errors.map((error) => ({ error, session }))}
          subcategorySuggestions={subcategories}
          lastCategory={lastUsedCategory(db)}
          initialMode={capture ? 'capture' : null}
          initialErrorId={errorId}
        />
      </div>
    </ImportHost>
  );
}

function SessionNotFound() {
  return (
    <div className={styles.notFound}>
      <BackToList />
      <h1 className={ui.pageTitle}>No encontramos esta sesión</h1>
      <p>Puede que se haya borrado o que el enlace esté incompleto. Tus demás sesiones siguen en el historial.</p>
      <Link href="/registrar" className={ui.secondary}>Ir a Sesiones</Link>
    </div>
  );
}
