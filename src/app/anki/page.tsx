import { ChevronRight } from 'lucide-react';

import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { ankiConfig, type AnkiConfig } from '@/lib/anki/config';
import { ankiContentStale } from '@/lib/anki/create';
import { ankiStatus } from '@/lib/anki/sync';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { q7AnkiReviews } from '@/lib/queries/q7AnkiReviews';
import type { Messages } from '@/lib/i18n';
import { dateTime, percent, sessionTitle, shortDate } from '../_shared/format';
import { EmptyState } from '../_shared/EmptyState';
import { getT } from '../_shared/i18nServer';
import { categoryLabel } from '../_shared/labels';
import { PageHeader } from '../_shared/PageHeader';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import { type ConvertedEntry, ConvertedList, PendingQueue, SyncButton } from './AnkiClient';
import styles from './anki.module.css';

/**
 * Anki: convertir errores en tarjetas y consultar los repasos, en pestañas separadas.
 *
 * La cola trae todo lo pendiente del historial, sin caducar (su contador es la cola
 * entera). Las cifras de conversión y los repasos sí miran el periodo, y lo dicen.
 */

export const dynamic = 'force-dynamic';

/** Cuántas conversiones se enseñan como contexto, además de las desactualizadas. */
const RECENT_CONVERSIONS = 8;

type Tab = 'pendientes' | 'convertidas' | 'repasos';

/** Una configuración inválida es un aviso, no una página rota. */
function safeAnkiConfig(): AnkiConfig | null {
  try { return ankiConfig(); } catch { return null; }
}

function ago(timestamp: string, now: Date, t: Messages): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return t.anki.justNow;
  if (minutes < 60) return t.anki.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.anki.hoursAgo(hours);
  return t.anki.onDate(dateTime(timestamp, t));
}

export default async function AnkiPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const a = t.anki;
  const windowDays = parseWindow(params['w']);
  // `?error=` llega desde el detalle de un error: «Crear la tarjeta».
  const selectedError = Number(typeof params['error'] === 'string' ? params['error'] : '');
  const tab: Tab = params['tab'] === 'convertidas' || params['tab'] === 'repasos' ? params['tab'] : 'pendientes';
  const now = new Date();
  const db = getDb();

  const data = loadDataset(db);
  const q5 = q5AnkiDebt(data, { now, windowDays });
  const anki = loadAnkiDataset(db);
  const config = safeAnkiConfig();
  const status = await ankiStatus(db, config ?? undefined);
  const lastSynced = anki.sync?.lastSyncedAt ?? null;
  const w = windowDays === 30 ? '' : `&w=${String(windowDays)}`;

  const sessionById = new Map(data.sessions.map((session) => [session.id, session]));
  const namespace = anki.sync?.namespace ?? null;
  const stale = new Set(namespace === null || config === null ? []
    : data.errors.filter((error) => ankiContentStale(error, namespace, config.targetDeck)).map((error) => error.id));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <PageHeader
          title="Anki"
          actions={(
            <div className={styles.connection}>
              {/* El estado se dice aquí una vez; el aviso de abajo solo explica por qué. */}
              <span className={status.available ? styles.connOn : styles.connOff}>
                <span className={styles.dot} aria-hidden="true" />
                {status.available ? a.available : a.unavailable}
              </span>
              <span className={ui.help}>
                {lastSynced === null ? a.notSyncedYet : a.syncedAgo(ago(lastSynced, now, t))}
              </span>
              <SyncButton available={status.available} />
            </div>
          )}
        />
        {!status.available && (
          <div className={ui.notice} role="status" id="anki-status">
            <span className={styles.noticeText}>
              {status.text(t)} {a.keepWorking}
            </span>
          </div>
        )}
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            {a.connectionHelp}
          </summary>
          <div className={`${ui.disclosureBody} ${styles.connectionBody}`}>
            {status.available && <p>{status.text(t)}</p>}
            <p>{a.deck(config?.sourceDeck ?? anki.sync?.sourceDeck ?? '—')}</p>
            {anki.sync?.rolloverHour != null && (
              <p>{a.rollover(anki.sync.rolloverHour, anki.sync.rolloverSource === 'config')}</p>
            )}
            <p>
              {a.installBefore}
              <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">AnkiConnect (2055492159)</a>
              {a.installAfter}
            </p>
          </div>
        </details>
        <RouteTabs
          label={a.views}
          items={[
            { href: `/anki${w === '' ? '' : `?${w.slice(1)}`}`, label: a.pendingTab(q5.queue.length), current: tab === 'pendientes' },
            { href: `/anki?tab=convertidas${w}`, label: a.convertedTab, current: tab === 'convertidas' },
            { href: `/anki?tab=repasos${w}`, label: a.reviewsTab, current: tab === 'repasos' },
          ]}
        />
      </div>

      {tab === 'pendientes' && (
        <section className={styles.section} aria-label={a.pendingSection}>
          <p className={styles.lead}>
            <strong>{a.pendingLeadStrong(q5.queue.length)}</strong>{a.pendingLeadRest}
          </p>
          {q5.queue.length === 0 ? (
            <EmptyState cause={q5.eligible === 0 && data.errors.length === 0 ? a.noEligibleYet : a.nonePending} />
          ) : (
            <PendingQueue
              available={status.available}
              initialId={Number.isInteger(selectedError) && selectedError > 0 ? selectedError : undefined}
              entries={q5.queue.map((error) => {
                const session = sessionById.get(error.sessionId);
                return {
                  id: error.id,
                  sessionId: error.sessionId,
                  date: session === undefined ? '' : shortDate(session.date, t),
                  sessionTitle: session === undefined ? '' : sessionTitle(session, t),
                  itemRef: error.itemRef,
                  prompt: error.prompt,
                  mine: error.myAnswer,
                  correct: error.correctAnswer,
                  rule: error.ruleNote,
                  category: categoryLabel(error.category, t),
                  cause: t.labels.cause[error.cause],
                  confidence: t.labels.confidence[error.confidence],
                };
              })}
            />
          )}
          <p className={ui.help}>
            {q5.pctConverted === null
              ? a.noneGenerates(windowDays)
              : a.conversionSummary(windowDays, q5.added, q5.eligible, percent(q5.pctConverted, t))}
          </p>
        </section>
      )}

      {tab === 'convertidas' && (() => {
        const converted = data.errors
          .filter((error) => error.ankiAdded && error.ankiAddedAt !== null)
          .sort((a, b) => (b.ankiAddedAt ?? '').localeCompare(a.ankiAddedAt ?? ''))
          .filter((error, index) => index < RECENT_CONVERSIONS || stale.has(error.id));
        const entries: ConvertedEntry[] = converted.map((error) => ({
          id: error.id,
          date: shortDate((error.ankiAddedAt ?? '').slice(0, 10), t),
          correct: error.correctAnswer,
          category: categoryLabel(error.category, t),
          state: error.ankiNoteId === null ? 'legacy' : stale.has(error.id) ? 'stale' : 'verified',
        }));
        return (
          <section className={`${styles.section} ${styles.narrow}`} aria-label={a.convertedTab}>
            <p className={styles.lead}>{a.convertedLead(RECENT_CONVERSIONS)}</p>
            {entries.length === 0
              ? <EmptyState cause={a.noneConverted} />
              : <ConvertedList entries={entries} available={status.available} />}
            <p className={ui.help}>{a.convertedHelp}</p>
          </section>
        );
      })()}

      {tab === 'repasos' && (() => {
        const reviews = q7AnkiReviews(anki, { now, windowDays }, data.errors);
        const synced = lastSynced !== null;
        const failing = reviews.groups.filter((group) => group.failures > 0);
        return (
          <section className={`${styles.section} ${styles.narrow}`} aria-label={a.reviewsSection}>
            <div className={styles.repHead}>
              <span className={ui.help}>{synced ? a.updatedAt(dateTime(lastSynced, t)) : a.notSynced}</span>
              <WindowSwitch current={windowDays} basePath="/anki" keep={{ tab: 'repasos' }} label={a.reviewsPeriod} />
            </div>
            {!synced ? (
              <EmptyState cause={a.syncToSee} />
            ) : (
              <>
                <dl className={styles.metrics}>
                  <div className={styles.metric}>
                    <dt className={ui.help}>{a.metricReviews}</dt>
                    <dd className={styles.metricMain}>{reviews.reviews}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt className={ui.help}>{a.metricLapses}</dt>
                    <dd className={styles.metricSub}>{reviews.lapses}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt className={ui.help}>{a.metricLearning}</dt>
                    <dd className={styles.metricSub}>{reviews.learningFailures}</dd>
                  </div>
                </dl>
                {reviews.reviews === 0 ? (
                  <EmptyState cause={a.noReviews(windowDays)} />
                ) : failing.length === 0 ? (
                  <EmptyState cause={a.noFailures} />
                ) : (
                  <div className={styles.groups}>
                    {failing.map((group) => (
                      <details key={group.category ?? 'SIN_MAPEAR'} className={styles.group}>
                        <summary className={styles.groupSummary}>
                          <h2 className={styles.groupName}>
                            <ChevronRight size={14} className="chevron" aria-hidden="true" />
                            {group.category === null ? a.noCategory : categoryLabel(group.category, t)}
                          </h2>
                          <span className={styles.muted}>
                            {a.groupStats(group.lapses, group.learningFailures, group.reviews)}
                          </span>
                        </summary>
                        <ul className={styles.notes}>
                          {group.notes.map((note) => (
                            <li key={note.noteId}>
                              <span className={styles.noteLabel}>{note.label}</span>
                              <span className={styles.muted}>{a.failures(note.failures)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}
                <details className={ui.disclosure}>
                  <summary>
                    <ChevronRight size={14} className="chevron" aria-hidden="true" />
                    {a.whatIsFailure}
                  </summary>
                  <div className={ui.disclosureBody}>
                    <p>{a.failureExplained}</p>
                    <p>{a.accuracyLine(reviews.accuracy === null ? '—' : percent(reviews.accuracy, t), reviews.distinctCards)}</p>
                  </div>
                </details>
              </>
            )}
          </section>
        );
      })()}
    </div>
  );
}
