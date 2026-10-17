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
import type { Messages } from '@/lib/i18n';
import { toIsoDate } from '@/lib/time/dates';
import { Kbd } from '../_shared/Kbd';
import { longDate, practiceLabel, practiceLongLabel, score, sessionTitle, shortDate } from '../_shared/format';
import { EmptyState } from '../_shared/EmptyState';
import { getT } from '../_shared/i18nServer';
import { ankiState } from '../_shared/labels';
import { StatusText } from '../_shared/StatusText';
import { PageHeader } from '../_shared/PageHeader';
import ui from '../_shared/ui.module.css';
import type { SearchParams } from '../_shared/window';
import { BackToList, RememberList } from './BackToList';
import { BatchDone } from './BatchDone';
import { ImportHost } from './ImportHost';
import { type ListParams, hasFilters, listHref, parseListParams } from './listParams';
import { ManualSession } from './ManualSession';
import { PasteEntry } from './PasteEntry';
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
  const t = await getT();
  const today = toIsoDate(new Date());
  const rawId = params['s'];

  if (rawId !== undefined) {
    const id = parseId(rawId);
    const session = id === null ? null : getSession(getDb(), id);
    if (session === null) return <SessionNotFound t={t} />;
    return <SessionDetail session={session} params={params} today={today} t={t} />;
  }
  return <SessionList params={parseListParams(params)} fromWriting={params['nueva'] === 'writing'} newSession={params['nueva'] === '1'} today={today} t={t} />;
}

function SessionList({ params, fromWriting, newSession, today, t }: {
  readonly params: ListParams;
  readonly fromWriting: boolean;
  readonly newSession: boolean;
  readonly today: string;
  readonly t: Messages;
}) {
  const db = getDb();
  const q = params.q.toLowerCase();
  // La fuente se busca por su nombre en el idioma en que se lee.
  const sources = q === '' ? [] : SOURCES.filter((source) => t.labels.source[source].toLowerCase().includes(q));
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
        <PageHeader
          title={t.nav.sessions}
          lede={t.sessions.lede}
          actions={(
            <ManualSession
              today={today}
              shortcut
              initiallyOpen={fromWriting || newSession}
              preset={fromWriting ? { kind: 'WRITING', paper: 'WRITING', part: 1 } : undefined}
              returnTo={fromWriting ? '/writing/importar?sesion={id}' : undefined}
            />
          )}
        />

        <section id="pegar" aria-label={t.sessions.importSection}>
          <PasteEntry variant="entry" globalPaste />
        </section>

        {empty ? (
          <section aria-labelledby="empty-heading">
            <EmptyState title={t.sessions.emptyTitle} titleId="empty-heading" cause={t.sessions.emptyBody} />
          </section>
        ) : (
          <section className={styles.history} aria-label={t.sessions.history}>
            <SessionsToolbar params={params} openCount={openCount} />
            {rows.length === 0 ? (
              <EmptyState
                cause={params.q === '' ? t.sessions.noMatchFilters : t.sessions.noMatchQuery(params.q)}
                action={<Link href="/registrar" className={ui.textLink}>{t.common.clearSearch}</Link>}
              />
            ) : (
              <SessionTable rows={rows.map((row) => ({
                id: row.id,
                href: `/registrar?s=${String(row.id)}`,
                date: shortDate(row.date, t),
                title: sessionTitle(row, t),
                source: t.labels.source[row.source],
                practice: practiceLabel(row, t),
                score: score(row),
                errors: row.errorCount,
                status: row.status,
              }))} />
            )}
            {pages > 1 && (
              <nav className={styles.pagination} aria-label={t.sessions.pages}>
                {page > 1
                  ? <Link href={listHref(params, { p: page - 1 })}>{t.common.listPrevious}</Link>
                  : <span className={styles.pageDisabled}>{t.common.listPrevious}</span>}
                <span className={styles.pageNow}>{page} / {pages}</span>
                {page < pages
                  ? <Link href={listHref(params, { p: page + 1 })}>{t.common.listNext}</Link>
                  : <span className={styles.pageDisabled}>{t.common.listNext}</span>}
              </nav>
            )}
            <div className={`${styles.shortcuts} keyboard-hint`} aria-hidden="true">
              <span><Kbd>J</Kbd><Kbd>K</Kbd>{t.sessions.keyMove}</span>
              <span><Kbd>↵</Kbd>{t.sessions.keyOpen}</span>
              <span><Kbd>N</Kbd>{t.sessions.keyNew}</span>
              <span><Kbd>G</Kbd><Kbd>E</Kbd>{t.sessions.keyErrors}</span>
            </div>
          </section>
        )}
      </div>
    </ImportHost>
  );
}

function SessionDetail({ session, params, today, t }: {
  readonly session: SessionRow;
  readonly params: SearchParams;
  readonly today: string;
  readonly t: Messages;
}) {
  const db = getDb();
  const errors = listErrors(db, session.id);
  const subcategories = distinctSubcategories(db);
  const rawNotice = params['aviso'];
  const notice = typeof rawNotice === 'string' ? rawNotice.trim().slice(0, 300) || null : null;
  const errorId = parseId(params['error']);
  const capture = params['modo'] === 'captura';
  const open = session.status === 'OPEN';
  const pendingCards = errors.filter((error) => ankiState(error) === 'PENDING').length;

  return (
    <ImportHost
      key={`s${String(session.id)}`}
      today={today}
      openSessions={[]}
      fixedTarget={open ? session : null}
      subcategorySuggestions={subcategories}
    >
      <div className={styles.detail}>
        <PageHeader
          back={{ node: <BackToList /> }}
          title={sessionTitle(session, t)}
          titleAside={<StatusText status={session.status} />}
          lede={(
            <>
              <span className={styles.facts}>
                <span>{longDate(session.date, t)}</span>
                <span>{practiceLongLabel(session, t)}</span>
                <span>{t.labels.source[session.source]}</span>
                <span className={styles.factStrong}>
                  {session.itemsTotal === null ? t.sessions.noItemCount : t.sessions.scoreCorrect(score(session))}
                </span>
              </span>
              {!open && <span className={ui.help}>{t.sessions.closedHelp}</span>}
            </>
          )}
          actions={<SessionControls session={session} impact={sessionDeletionImpact(db, session.id)} today={today} />}
        />

        <BatchDone notice={notice} sessionId={session.id} pendingCards={pendingCards} />

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

function SessionNotFound({ t }: { readonly t: Messages }) {
  return (
    <div className={styles.notFound}>
      <PageHeader back={{ node: <BackToList /> }} title={t.sessions.notFoundTitle} lede={t.sessions.notFoundBody} />
      <Link href="/registrar" className={ui.secondary}>{t.common.goToSessions}</Link>
    </div>
  );
}
