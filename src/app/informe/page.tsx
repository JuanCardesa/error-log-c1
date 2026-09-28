import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { listSessions } from '@/lib/db/repo';
import { CAUSE_META } from '@/lib/domain/enums';
import { MIN_N } from '@/lib/domain/thresholds';
import { q1CauseSplit } from '@/lib/queries/q1CauseSplit';
import { q2CategoryRate } from '@/lib/queries/q2CategoryRate';
import { q3RuoeAccuracy } from '@/lib/queries/q3RuoeAccuracy';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { sliceWindow } from '@/lib/queries/window';
import { runRules } from '@/lib/rules';
import { toIsoDate, windowStart } from '@/lib/time/dates';
import { dateRange, decimal, percent, score, sessionTitle, shortDate } from '../_shared/format';
import { CATEGORY_LABELS, CAUSE_LABELS, RULE_STATUS_LABELS } from '../_shared/labels';
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
  const rec = recommend(report, q5, q1.total, windowDays);
  const w = windowDays === 30 ? '' : `?w=${String(windowDays)}`;

  const head = (
    <div className={styles.head}>
      <div className={ui.pageHead}>
        <h1 className={ui.pageTitle}>Progreso</h1>
        <WindowSwitch current={windowDays} basePath="/informe" />
      </div>
      <RouteTabs
        label="Vistas de progreso"
        items={[
          { href: `/informe${w}`, label: 'Resumen', current: true },
          { href: `/ruoe${w}`, label: 'Reading & Use of English', current: false },
        ]}
      />
    </div>
  );

  if (data.sessions.length === 0) {
    return (
      <div className={styles.page}>
        {head}
        <section className={styles.emptyState}>
          <h2 className={styles.recoTitle}>Registra tu primera práctica</h2>
          <p>Las recomendaciones, categorías y causas aparecen cuando hay sesiones en el periodo. Sin datos no se saca ninguna conclusión.</p>
          <Link href="/registrar" className={ui.primary}>Ir a Sesiones</Link>
        </section>
      </div>
    );
  }

  const writingErrors = q2.excludedErrors;
  const weeks = windowWeeks(now, windowDays).slice(-MULTIPLE_WEEKS);
  const recent = listSessions(db, 3);
  const others = report.rules.filter((rule) => rule.status === 'QUEUED' || rule.status === 'WATCH');
  const maxCause = Math.max(1, ...q1.rows.map((row) => row.n));
  const topCategories = q2.rows.slice(0, TOP_CATEGORIES);
  const restCategories = q2.rows.slice(TOP_CATEGORIES);
  const categoryHref = (category: string) =>
    `/errores?cat=${category}&w=${String(windowDays)}&items=1`;

  return (
    <div className={styles.page}>
      {head}

      <section className={styles.reco} aria-labelledby="reco-title">
        <span className={styles.kicker}>{rec.kicker}</span>
        <h2 id="reco-title" className={styles.recoTitle}>
          {slice.sessions.length === 0 ? 'Sin práctica registrada en este periodo' : rec.title}
        </h2>
        <p className={styles.evidence}>
          {slice.sessions.length === 0
            ? `No hay sesiones en los últimos ${String(windowDays)} días. Registra una práctica o amplía el periodo.`
            : rec.evidence}
        </p>
        {(rec.action !== null || rec.why !== null) && slice.sessions.length > 0 && (
          <div className={styles.recoActions}>
            {rec.action !== null && <Link href={rec.action.href} className={ui.primary}>{rec.action.label}</Link>}
            {rec.why !== null && (
              <details className={ui.disclosure}>
                <summary>
                  <ChevronRight size={14} className="chevron" aria-hidden="true" />
                  Por qué esta recomendación
                </summary>
                <p className={ui.disclosureBody}>{rec.why}</p>
              </details>
            )}
          </div>
        )}
        <div className={styles.coverage}>
          <span>Periodo: {dateRange(windowStart(now, windowDays), toIsoDate(now))}</span>
          <span>{slice.sessions.length} {slice.sessions.length === 1 ? 'sesión' : 'sesiones'}</span>
          <span>{q2.itemsAttempted} ítems contabilizados (excluye Writing)</span>
          <span>
            {q1.total} {q1.total === 1 ? 'error' : 'errores'}
            {writingErrors > 0 ? `, ${String(writingErrors)} de ellos en Writing` : ''}
          </span>
        </div>
      </section>

      {q1.total > 0 && q1.total < MIN_N && (
        <p className={styles.smallSample}>
          <strong>Muestra pequeña</strong>
          <span>{q1.total} {q1.total === 1 ? 'error' : 'errores'} en {windowDays} días. Léelo como orientación: todavía no es un patrón.</span>
        </p>
      )}

      <div className={styles.columns}>
        <section className={styles.block} aria-labelledby="cat-heading">
          <h2 id="cat-heading" className={ui.sectionTitle}>Dónde se concentran los errores</h2>
          {q2.rows.length === 0 ? (
            <p className={styles.blockEmpty}>Sin errores en sesiones con ítems contabilizados en este periodo.</p>
          ) : (
            <>
              <table className={styles.catTable}>
                <caption className="sr-only">Categorías por errores cada 100 ítems</caption>
                <thead>
                  <tr>
                    <th scope="col">Categoría</th>
                    <th scope="col" className={styles.num}>Errores</th>
                    <th scope="col" className={styles.num}>Por 100 ítems</th>
                    <th scope="col"><span className="sr-only">Ver errores</span></th>
                  </tr>
                </thead>
                <tbody>
                  {topCategories.map((row) => (
                    <tr key={row.category}>
                      <td>
                        <Link href={categoryHref(row.category)} className={styles.catLink}>{CATEGORY_LABELS[row.category]}</Link>
                      </td>
                      <td className={styles.num}>{row.errors}</td>
                      <td className={styles.num}>{decimal(row.ratePer100, 2)}</td>
                      <td className={styles.arrowCell} aria-hidden="true"><ArrowRight size={14} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {restCategories.length > 0 && (
                <details className={ui.disclosure}>
                  <summary>
                    <ChevronRight size={14} className="chevron" aria-hidden="true" />
                    Ver las otras {restCategories.length} categorías
                  </summary>
                  <ul className={styles.restList}>
                    {restCategories.map((row) => (
                      <li key={row.category}>
                        <Link href={categoryHref(row.category)}>{CATEGORY_LABELS[row.category]}</Link>
                        <span className="num">{row.errors} · {decimal(row.ratePer100, 2)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <span className={ui.help}>Errores por cada 100 ítems contabilizados en total, no tasa de fallo dentro de la categoría.</span>
            </>
          )}
        </section>

        <section className={styles.block} aria-labelledby="cause-heading">
          <h2 id="cause-heading" className={ui.sectionTitle}>Por qué ocurren</h2>
          {q1.total === 0 ? (
            <p className={styles.blockEmpty}>No hay errores registrados en este periodo. Eso no demuestra dominio: solo que no hay datos que leer.</p>
          ) : (
            <>
              <div className={styles.causes}>
                {q1.rows.map((row) => (
                  <details key={row.cause} className={styles.cause}>
                    <summary className={styles.causeSummary}>
                      <span className={styles.causeName}>{CAUSE_LABELS[row.cause]}</span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={row.side === 'study' ? styles.barStudy : styles.barExec}
                          style={{ width: `${String((row.n / maxCause) * 100)}%` }}
                        />
                      </span>
                      <span className={styles.causeValue}>{percent(row.pct)} · {row.n}</span>
                    </summary>
                    <p className={styles.causeBody}>{CAUSE_META[row.cause].meaning}. {CAUSE_META[row.cause].remedy}.</p>
                  </details>
                ))}
              </div>
              <span className={styles.legend}>
                <span><span className={styles.swatchStudy} aria-hidden="true" />Se estudia</span>
                <span><span className={styles.swatchExec} aria-hidden="true" />Se corrige con el protocolo de examen</span>
              </span>
            </>
          )}
        </section>
      </div>

      <section className={styles.block} aria-labelledby="evo-heading">
        <div className={styles.blockHead}>
          <h2 id="evo-heading" className={ui.sectionTitle}>Evolución por part</h2>
          <Link href={`/ruoe${w}`} className={styles.moreLink}>
            Ver matriz completa <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {q3.rows.length === 0 ? (
          <p className={styles.blockEmpty}>Sin sesiones de Reading & Use of English con ítems en este periodo.</p>
        ) : (
          <>
            <div className={styles.multiples}>
              {q3.rows.map((row) => {
                const cells = weeks.map((week) => {
                  const index = q3.weeks.indexOf(week.iso);
                  return index < 0 ? null : row.cells[index] ?? null;
                });
                const latest = [...cells].reverse().find((cell) => cell !== null) ?? null;
                return (
                  <div key={row.part} className={styles.multiple}>
                    <span className={styles.multipleHead}>
                      <span className={styles.multiplePart}>Part {row.part}</span>
                      <span className={styles.mono}>{latest === null ? '—' : percent(latest.pct)}</span>
                    </span>
                    <div className={styles.bars} role="img" aria-label={`Part ${String(row.part)}: ${cells.map((cell, i) => `${weeks[i]?.range ?? ''} ${cell === null ? 'sin práctica' : percent(cell.pct)}`).join(', ')}`}>
                      {cells.map((cell, index) => (
                        <span
                          key={weeks[index]?.iso ?? index}
                          className={cell === null ? styles.barNone : index === cells.length - 1 ? styles.barLast : styles.barPast}
                          style={cell === null ? undefined : { height: `${String(Math.max(2, Math.round((cell.pct / 100) * BAR_MAX_PX)))}px` }}
                        />
                      ))}
                    </div>
                    <span className={styles.ratios}>
                      {cells.map((cell) => (cell === null ? '—' : `${String(cell.correct)}/${String(cell.total)}`)).join(' · ')}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className={ui.help}>
              Últimas {weeks.length} semanas ({weeks[0]?.range ?? ''} a {weeks.at(-1)?.range ?? ''}); la última resaltada. — sin práctica esa semana; la altura es la precisión de la semana.
            </span>
          </>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.block} aria-labelledby="recent-heading">
          <h2 id="recent-heading" className={ui.sectionTitle}>Actividad reciente</h2>
          <ul className={styles.recent}>
            {recent.map((session) => (
              <li key={session.id}>
                <Link href={`/registrar?s=${String(session.id)}`} className={styles.recentLink}>
                  <span><span className={styles.recentDate}>{shortDate(session.date)}</span>{sessionTitle(session)}</span>
                  <span className={styles.recentScore}>{session.itemsTotal === null ? 'Writing' : score(session, '/')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.block} aria-labelledby="others-heading">
          <h2 id="others-heading" className={ui.sectionTitle}>Otras recomendaciones</h2>
          <details className={`${ui.disclosure} ${styles.othersBox}`}>
            <summary>
              <ChevronRight size={14} className="chevron" aria-hidden="true" />
              {others.length === 0
                ? 'Ninguna otra regla se dispara ni está en vigilancia'
                : `Otras ${String(others.length)} ${others.length === 1 ? 'recomendación' : 'recomendaciones'} · ver detalle`}
            </summary>
            {others.length > 0 && (
              <ol className={styles.othersList}>
                {others.map((rule) => (
                  <li key={rule.id}>
                    <strong>{RULE_STATUS_LABELS[rule.status]}</strong> · {recommendationTitle(rule)}.
                  </li>
                ))}
              </ol>
            )}
          </details>
          <RulesDetails report={report} />
        </section>
      </div>
    </div>
  );
}
