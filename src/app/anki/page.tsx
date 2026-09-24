import { ChevronRight } from 'lucide-react';

import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { ankiConfig, type AnkiConfig } from '@/lib/anki/config';
import { ankiContentStale } from '@/lib/anki/create';
import { ankiStatus } from '@/lib/anki/sync';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { q7AnkiReviews } from '@/lib/queries/q7AnkiReviews';
import { dateTime, percent, sessionTitle, shortDate } from '../_shared/format';
import { CAUSE_LABELS, CONFIDENCE_LABELS, categoryLabel } from '../_shared/labels';
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

function ago(timestamp: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${String(hours)} h`;
  return `el ${dateTime(timestamp)}`;
}

export default async function AnkiPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);
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
        <div className={ui.pageHead}>
          <h1 className={ui.pageTitle}>Anki</h1>
          <div className={styles.connection}>
            <span className={status.available ? styles.connOn : styles.connOff}>
              <span className={styles.dot} aria-hidden="true" />
              {status.available ? 'Disponible' : 'No disponible'}
            </span>
            <span className={ui.help}>
              {lastSynced === null ? 'Sin sincronizar todavía' : `Sincronizado ${ago(lastSynced, now)}`}
            </span>
            <SyncButton />
          </div>
        </div>
        {!status.available && (
          <div className={ui.notice} role="status" id="anki-status">
            <span className={ui.noticeTitleWarn}>No conectado.</span>
            <span className={styles.noticeText}>
              {status.message} Puedes seguir leyendo y editando la cola.
            </span>
          </div>
        )}
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            Conexión y cómo conectar Anki
          </summary>
          <div className={`${ui.disclosureBody} ${styles.connectionBody}`}>
            <p>{status.message}</p>
            <p>Mazo: {config?.sourceDeck ?? anki.sync?.sourceDeck ?? '—'} y sus submazos.</p>
            {anki.sync?.rolloverHour != null && (
              <p>
                Día de Anki: {anki.sync.rolloverSource === 'config' ? 'empieza' : 'se supone que empieza'} a las {anki.sync.rolloverHour}:00
                {anki.sync.rolloverSource === 'config' ? ', según ANKI_ROLLOVER_HOUR.' : ', el valor por defecto de Anki. Si tu colección usa otra hora, ponla en ANKI_ROLLOVER_HOUR y vuelve a sincronizar.'}
              </p>
            )}
            <p>
              En Anki: Herramientas → Complementos → Descargar complementos. Instala{' '}
              <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">AnkiConnect (2055492159)</a>,
              reinicia Anki y deja abierto el perfil de tu colección. Después pulsa Sincronizar.
            </p>
          </div>
        </details>
        <RouteTabs
          label="Vistas de Anki"
          items={[
            { href: `/anki${w === '' ? '' : `?${w.slice(1)}`}`, label: `Pendientes (${String(q5.queue.length)})`, current: tab === 'pendientes' },
            { href: `/anki?tab=convertidas${w}`, label: 'Convertidas', current: tab === 'convertidas' },
            { href: `/anki?tab=repasos${w}`, label: 'Repasos', current: tab === 'repasos' },
          ]}
        />
      </div>

      {tab === 'pendientes' && (
        <section className={styles.section} aria-label="Pendientes de crear en Anki">
          <p className={styles.lead}>
            <strong>{q5.queue.length} pendientes</strong> en todo el historial · más antiguos primero
          </p>
          {q5.queue.length === 0 ? (
            <p className={styles.empty}>
              {q5.eligible === 0 && data.errors.length === 0
                ? 'Todavía no hay errores que conviertan en tarjeta.'
                : 'No quedan errores pendientes de convertir.'}
            </p>
          ) : (
            <PendingQueue
              available={status.available}
              entries={q5.queue.map((error) => {
                const session = sessionById.get(error.sessionId);
                return {
                  id: error.id,
                  sessionId: error.sessionId,
                  date: session === undefined ? '' : shortDate(session.date),
                  sessionTitle: session === undefined ? '' : sessionTitle(session),
                  itemRef: error.itemRef,
                  prompt: error.prompt,
                  mine: error.myAnswer,
                  correct: error.correctAnswer,
                  rule: error.ruleNote,
                  category: categoryLabel(error.category),
                  cause: CAUSE_LABELS[error.cause],
                  confidence: CONFIDENCE_LABELS[error.confidence],
                };
              })}
            />
          )}
          <p className={ui.help}>
            {q5.pctConverted === null
              ? `Ningún error de los últimos ${String(windowDays)} días genera tarjeta.`
              : `En los últimos ${String(windowDays)} días: ${String(q5.added)} de ${String(q5.eligible)} errores elegibles convertidos (${percent(q5.pctConverted)}). Solo cuentan las causas que generan tarjeta.`}
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
          date: shortDate((error.ankiAddedAt ?? '').slice(0, 10)),
          correct: error.correctAnswer,
          category: categoryLabel(error.category),
          state: error.ankiNoteId === null ? 'legacy' : stale.has(error.id) ? 'stale' : 'verified',
        }));
        return (
          <section className={`${styles.section} ${styles.narrow}`} aria-label="Convertidas">
            <p className={styles.lead}>Últimas {RECENT_CONVERSIONS} convertidas y todas las desactualizadas.</p>
            {entries.length === 0
              ? <p className={styles.empty}>Todavía no hay errores convertidos en tarjeta.</p>
              : <ConvertedList entries={entries} available={status.available} />}
            <p className={ui.help}>
              «Desactualizada»: el error ha cambiado desde que se creó la tarjeta; actualizar solo reescribe sus campos.
              Devolver a pendientes desvincula el error: la nota y su historial se conservan en Anki.
            </p>
          </section>
        );
      })()}

      {tab === 'repasos' && (() => {
        const reviews = q7AnkiReviews(anki, { now, windowDays }, data.errors);
        const synced = lastSynced !== null;
        const failing = reviews.groups.filter((group) => group.failures > 0);
        return (
          <section className={`${styles.section} ${styles.narrow}`} aria-label="Repasos en Anki">
            <div className={styles.repHead}>
              <span className={ui.help}>{synced ? `Actualizado: ${dateTime(lastSynced)}` : 'Sin sincronizar'}</span>
              <WindowSwitch current={windowDays} basePath="/anki" keep={{ tab: 'repasos' }} label="Periodo de los repasos" />
            </div>
            {!synced ? (
              <p className={styles.empty}>Sincroniza Anki para consultar tus repasos. Todavía no hay datos importados: no son cero fallos.</p>
            ) : (
              <>
                <dl className={styles.metrics}>
                  <div className={styles.metric}>
                    <dt className={ui.help}>repasos</dt>
                    <dd className={styles.metricMain}>{reviews.reviews}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt className={ui.help}>lapsos · tarjetas maduras olvidadas</dt>
                    <dd className={styles.metricSub}>{reviews.lapses}</dd>
                  </div>
                  <div className={styles.metric}>
                    <dt className={ui.help}>fallos aprendiendo</dt>
                    <dd className={styles.metricSub}>{reviews.learningFailures}</dd>
                  </div>
                </dl>
                {reviews.reviews === 0 ? (
                  <p className={styles.empty}>Sin repasos en los últimos {windowDays} días. El historial antiguo no cuenta como estudio reciente.</p>
                ) : failing.length === 0 ? (
                  <p className={styles.empty}>Sin fallos en los repasos de este periodo.</p>
                ) : (
                  <div className={styles.groups}>
                    {failing.map((group) => (
                      <details key={group.category ?? 'SIN_MAPEAR'} className={styles.group}>
                        <summary className={styles.groupSummary}>
                          <h3 className={styles.groupName}>
                            <ChevronRight size={14} className="chevron" aria-hidden="true" />
                            {group.category === null ? 'Sin categoría asignada' : categoryLabel(group.category)}
                          </h3>
                          <span className={styles.muted}>
                            {group.lapses} lapsos · {group.learningFailures} aprendiendo / {group.reviews} repasos
                          </span>
                        </summary>
                        <ul className={styles.notes}>
                          {group.notes.map((note) => (
                            <li key={note.noteId}>
                              <span className={styles.noteLabel}>{note.label}</span>
                              <span className={styles.muted}>{note.failures} {note.failures === 1 ? 'fallo' : 'fallos'}</span>
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
                    Qué es un fallo y un lapso, y otras cifras
                  </summary>
                  <div className={ui.disclosureBody}>
                    <p>
                      «Again» cuenta como fallo; Hard, Good y Easy como acierto. Un lapso es un «Again» en una tarjeta ya
                      aprendida. Un «Again» en los pasos de aprendizaje es estar montándola, lo normal en una tarjeta nueva.
                      Estas cifras vienen de Anki y no se comparan con la precisión de tus prácticas: tienen denominadores distintos.
                    </p>
                    <p>
                      Aciertos: {reviews.accuracy === null ? '—' : percent(reviews.accuracy)} · cartas distintas repasadas: {reviews.distinctCards}.
                    </p>
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
