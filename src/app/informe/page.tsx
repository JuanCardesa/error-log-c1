import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { listSessions } from '@/lib/db/repo';
import { partsFor } from '@/lib/domain/enums';
import { MIN_N } from '@/lib/domain/thresholds';
import { q1CauseSplit } from '@/lib/queries/q1CauseSplit';
import { q2CategoryRate } from '@/lib/queries/q2CategoryRate';
import { q3RuoeAccuracy } from '@/lib/queries/q3RuoeAccuracy';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { sliceWindow } from '@/lib/queries/window';
import { runRules } from '@/lib/rules';
import { toIsoDate, windowStart } from '@/lib/time/dates';
import { dateRange, decimal, partList, percent, score, sessionTitle, shortDate } from '../_shared/format';
import { EmptyState } from '../_shared/EmptyState';
import { getT } from '../_shared/i18nServer';
import { PageHeader } from '../_shared/PageHeader';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import { windowWeeks } from '../_shared/weeks';
import { recommend, recommendationTitle } from './recommendation';
import { RulesDetails } from './RulesTable';
import styles from './progreso.module.css';

/**
 * Progreso: una decisión arriba y su respaldo debajo. Qué practicar, dónde se concentran
 * los errores, por qué ocurren y cómo evoluciona cada part. No hay nota global ni índice
 * agregado: cada cifra dice su denominador.
 */

export const dynamic = 'force-dynamic';

const TOP_CATEGORIES = 5;
const MULTIPLE_WEEKS = 4;
const BAR_MAX_PX = 56;

export default async function InformePage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const p = t.progress;
  const windowDays = parseWindow(params['w']);
  const now = new Date();
  const options = { now, windowDays };

  const db = getDb();
  const data = loadDataset(db);
  const slice = sliceWindow(data, now, windowDays);
  const q1 = q1CauseSplit(data, options);
  const q2 = q2CategoryRate(data, options);
  const q3 = q3RuoeAccuracy(data, options);
  const q5 = q5AnkiDebt(data, options);
  const report = runRules(data, options);
  const rec = recommend(report, q5, q1.total, windowDays, t);
  const w = windowDays === 30 ? '' : `?w=${String(windowDays)}`;

  const head = (
    <PageHeader
      title={t.nav.progress}
      actions={<WindowSwitch current={windowDays} basePath="/informe" />}
      tabs={(
        <RouteTabs
          label={p.views}
          items={[
            { href: `/informe${w}`, label: p.summary, current: true },
            { href: `/ruoe${w}`, label: t.labels.paperLong.RUOE, current: false },
          ]}
        />
      )}
    />
  );

  if (data.sessions.length === 0) {
    return (
      <div className={styles.page}>
        {head}
        <section className={styles.emptyState}>
          <h2 className={ui.decisionTitle}>{p.emptyTitle}</h2>
          <p>{p.emptyBody}</p>
          <Link href="/registrar" className={ui.primary}>{t.common.goToSessions}</Link>
        </section>
      </div>
    );
  }

  const writingErrors = q2.excludedErrors;
  const weeks = windowWeeks(now, windowDays, t).slice(-MULTIPLE_WEEKS);
  const recent = listSessions(db, 3);
  const others = report.rules.filter((rule) => rule.status === 'QUEUED' || rule.status === 'WATCH');
  const maxCause = Math.max(1, ...q1.rows.map((row) => row.n));
  const topCategories = q2.rows.slice(0, TOP_CATEGORIES);
  const restCategories = q2.rows.slice(TOP_CATEGORIES);
  const categoryHref = (category: string) =>
    `/errores?cat=${category}&w=${String(windowDays)}&items=1`;

  // Evolución: cada part con práctica en las últimas semanas, y su cifra es la de la última
  // semana con práctica, que es la barra resaltada. Las parts sin práctica en esas semanas
  // (también las que no se han hecho nunca) se nombran en una línea en vez de dibujarse vacías.
  const evolution = q3.rows.map((row) => {
    const cells = weeks.map((week) => {
      const index = q3.weeks.indexOf(week.iso);
      return index < 0 ? null : row.cells[index] ?? null;
    });
    const label = cells.map((cell, i) => {
      const value = cell === null ? p.noPractice : `${percent(cell.pct, t)} (${String(cell.correct)}/${String(cell.total)})`;
      return `${weeks[i]?.range ?? ''} ${value}`;
    });
    return {
      part: row.part,
      cells,
      latest: cells.findLastIndex((cell) => cell !== null),
      label: `${t.format.part(row.part)}: ${label.join(', ')}`,
    };
  });
  const barClass = (cell: unknown, index: number, latest: number) => {
    if (cell === null) return styles.barNone;
    return index === latest ? styles.barLast : styles.barPast;
  };
  const practised = evolution.filter((row) => row.latest >= 0);
  const unpractised = partsFor('RUOE').filter((part) => !practised.some((row) => row.part === part));

  return (
    <div className={styles.page}>
      {head}

      <section className={ui.decision} aria-labelledby="reco-title">
        <span className={ui.decisionKicker}>{rec.kicker}</span>
        <h2 id="reco-title" className={ui.decisionTitle}>
          {slice.sessions.length === 0 ? p.noPracticeTitle : rec.title}
        </h2>
        <p className={ui.decisionEvidence}>
          {slice.sessions.length === 0 ? p.noPracticeBody(windowDays) : rec.evidence}
        </p>
        {(rec.action !== null || rec.why !== null) && slice.sessions.length > 0 && (
          <div className={ui.decisionActions}>
            {rec.action !== null && <Link href={rec.action.href} className={ui.primary}>{rec.action.label}</Link>}
            {rec.why !== null && (
              <details className={ui.disclosure}>
                <summary>
                  <ChevronRight size={14} className="chevron" aria-hidden="true" />
                  {p.whyThis}
                </summary>
                <p className={ui.disclosureBody}>{rec.why}</p>
              </details>
            )}
          </div>
        )}
        <div className={ui.decisionCoverage}>
          <span>{p.period(dateRange(windowStart(now, windowDays), toIsoDate(now), t))}</span>
          <span>{t.format.sessions(slice.sessions.length)}</span>
          <span>{p.itemsCounted(q2.itemsAttempted)}</span>
          <span>{p.errorsCovered(q1.total, writingErrors)}</span>
        </div>
      </section>

      {q1.total > 0 && q1.total < MIN_N && (
        <p className={`${ui.smallSample} ${styles.smallSampleBand}`}>
          <strong>{p.smallSample}</strong>
          <span>{p.smallSampleBody(q1.total, windowDays)}</span>
        </p>
      )}

      <div className={styles.columns}>
        <section className={styles.block} aria-labelledby="cat-heading">
          <h2 id="cat-heading" className={ui.sectionTitle}>{p.whereTitle}</h2>
          {q2.rows.length === 0 ? (
            <EmptyState cause={p.whereEmpty} />
          ) : (
            <>
              <table className={ui.dataTable}>
                <caption className="sr-only">{p.catCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.errorForm.category}</th>
                    <th scope="col" className={ui.colNum}>{t.nav.errors}</th>
                    <th scope="col" className={ui.colNum}>{p.per100}</th>
                    <th scope="col"><span className="sr-only">{p.seeErrors}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {/* La fila entera abre sus errores: el enlace se estira sobre ella y la flecha lo anuncia. */}
                  {topCategories.map((row) => (
                    <tr key={row.category} className={styles.catRow}>
                      <th scope="row">
                        <Link href={categoryHref(row.category)} className={styles.catLink}>{t.labels.category[row.category]}</Link>
                      </th>
                      <td className={ui.colNum}>{row.errors}</td>
                      <td className={ui.colNum}>{decimal(row.ratePer100, t, 2)}</td>
                      <td className={styles.arrowCell} aria-hidden="true"><ArrowRight size={14} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {restCategories.length > 0 && (
                <details className={ui.disclosure}>
                  <summary>
                    <ChevronRight size={14} className="chevron" aria-hidden="true" />
                    {p.otherCategories(restCategories.length)}
                  </summary>
                  <ul className={styles.restList}>
                    {restCategories.map((row) => (
                      <li key={row.category}>
                        <Link href={categoryHref(row.category)}>{t.labels.category[row.category]}</Link>
                        <span className="num">{row.errors} · {decimal(row.ratePer100, t, 2)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <span className={ui.help}>{p.per100Help}</span>
            </>
          )}
        </section>

        <section className={styles.block} aria-labelledby="cause-heading">
          <h2 id="cause-heading" className={ui.sectionTitle}>{p.whyTitle}</h2>
          {q1.total === 0 ? (
            <EmptyState cause={p.whyEmpty} />
          ) : (
            <>
              <div className={styles.causes}>
                {q1.rows.map((row) => (
                  <details key={row.cause} className={styles.cause}>
                    <summary className={styles.causeSummary}>
                      <span className={styles.causeName}>{t.labels.cause[row.cause]}</span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={row.side === 'study' ? styles.barStudy : styles.barExec}
                          style={{ width: `${String((row.n / maxCause) * 100)}%` }}
                        />
                      </span>
                      <span className={styles.causeValue}>{percent(row.pct, t)} · {row.n}</span>
                    </summary>
                    <p className={styles.causeBody}>{t.labels.causeMeaning[row.cause]}. {t.labels.causeRemedy[row.cause]}.</p>
                  </details>
                ))}
              </div>
              <span className={styles.legend}>
                <span><span className={styles.swatchStudy} aria-hidden="true" />{p.legendStudy}</span>
                <span><span className={styles.swatchExec} aria-hidden="true" />{p.legendExec}</span>
              </span>
            </>
          )}
        </section>
      </div>

      <section className={styles.block} aria-labelledby="evo-heading">
        <div className={styles.blockHead}>
          <h2 id="evo-heading" className={ui.sectionTitle}>{p.evolutionTitle}</h2>
          <Link href={`/ruoe${w}`} className={styles.moreLink}>
            {p.fullMatrix} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {q3.rows.length === 0 ? (
          <EmptyState cause={p.evolutionEmpty} />
        ) : (
          <>
            {practised.length > 0 && (
              <div className={styles.multiples}>
                {practised.map(({ part, cells, latest, label }) => (
                  <div key={part} className={styles.multiple}>
                    <span className={styles.multipleHead}>
                      <span className={styles.multiplePart}>{t.format.part(part)}</span>
                      <span className={styles.mono}>{percent(cells[latest]?.pct ?? 0, t)}</span>
                    </span>
                    <div
                      className={styles.chart}
                      style={{ gridTemplateColumns: `repeat(${String(weeks.length)}, minmax(0, 1fr))` }}
                      role="img"
                      aria-label={label}
                    >
                      {cells.map((cell, index) => (
                        <span key={weeks[index]?.iso ?? index} className={styles.week}>
                          <span className={styles.ratio}>
                            {cell === null ? '—' : `${String(cell.correct)}/${String(cell.total)}`}
                          </span>
                          <span className={styles.barSlot}>
                            <span
                              className={barClass(cell, index, latest)}
                              style={cell === null ? undefined : { height: `${String(Math.max(2, Math.round((cell.pct / 100) * BAR_MAX_PX)))}px` }}
                            />
                          </span>
                          <span className={styles.weekDate}>{shortDate(weeks[index]?.start ?? '', t)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {unpractised.length > 0 && (
              <p className={styles.unpractised}>{p.partsWithoutPractice(partList(unpractised, t))}</p>
            )}
            <span className={ui.help}>{p.weeksHelp(weeks.length)}</span>
          </>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.block} aria-labelledby="recent-heading">
          <h2 id="recent-heading" className={ui.sectionTitle}>{p.recentTitle}</h2>
          <ul className={styles.recent}>
            {recent.map((session) => (
              <li key={session.id}>
                <Link href={`/registrar?s=${String(session.id)}`} className={styles.recentLink}>
                  <span><span className={styles.recentDate}>{shortDate(session.date, t)}</span>{sessionTitle(session, t)}</span>
                  <span className={styles.recentScore}>{session.itemsTotal === null ? 'Writing' : score(session, '/')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.block} aria-labelledby="others-heading">
          <h2 id="others-heading" className={ui.sectionTitle}>{p.othersTitle}</h2>
          <details className={`${ui.disclosure} ${styles.othersBox}`}>
            <summary>
              <ChevronRight size={14} className="chevron" aria-hidden="true" />
              {others.length === 0 ? p.othersNone : p.othersCount(others.length)}
            </summary>
            {others.length > 0 && (
              <ol className={styles.othersList}>
                {others.map((rule) => (
                  <li key={rule.id}>
                    <strong>{t.labels.ruleStatus[rule.status]}</strong> · {recommendationTitle(rule, t)}.
                  </li>
                ))}
              </ol>
            )}
          </details>
          <RulesDetails report={report} t={t} />
        </section>
      </div>
    </div>
  );
}
