import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { WritingCriterion } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';
import {
  MIN_CRITERION_N, PROGRESS_METRICS, writingProgress, type ProgressFilters, type ProgressMetric, type ProgressPoint,
} from '@/lib/writing/progress';
import { writingHref } from '@/lib/writing/urls';
import { FilterBar } from '../_shared/FilterBar';
import { FilterMenu } from '../_shared/FilterMenu';
import { decimal, mediumDate } from '../_shared/format';
import ui from '../_shared/ui.module.css';
import { CRITERION_LABEL } from './bands';
import type { LibraryItem } from './entries';
import styles from './writing.module.css';

/** Media legible: `2,75`, `3`, `3,33`; nunca `3,333333`. */
const average = (value: number, t: Messages) => decimal(Math.round(value * 100) / 100, t);

/**
 * Writing → Progreso abre con una decisión: el criterio más bajo y qué repasar. Las cifras
 * van debajo, como respaldo: la tabla por criterio y la evolución de una medida.
 */
export function ProgressView({ items, filters, t }: {
  readonly items: readonly LibraryItem[];
  readonly filters: ProgressFilters;
  readonly t: Messages;
}) {
  const w = t.writing.progress;
  const progress = writingProgress(items.map(({ row }) => row.piece), filters);
  const shown = filters.genre === null ? items : items.filter((item) => item.genre === filters.genre);
  const metricLabel = (metric: ProgressMetric) => metric === 'TOTAL' ? w.total : CRITERION_LABEL[metric];
  const href = (patch: Partial<ProgressFilters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams({ tab: 'progreso' });
    if (next.metric !== 'TOTAL') params.set('measure', next.metric);
    if (next.genre !== null) params.set('type', next.genre);
    return `/writing?${params.toString()}`;
  };
  const genres = [...new Set(items.map((item) => item.genre))];
  const weakest = progress.focus.kind === 'weakest' ? progress.focus.criteria : [];

  return (
    <div className={styles.progress}>
      <Decision items={shown} filters={filters} progress={progress} t={t} />

      {progress.smallSample && (
        <p className={ui.smallSample}>
          <strong>{w.smallSample}</strong>
          <span>{w.smallSampleBody(MIN_CRITERION_N)}</span>
        </p>
      )}

      {progress.focus.kind !== 'none' && (
        <div className={styles.progressColumns}>
          <section className={styles.progressBlock} aria-labelledby="writing-criteria-title">
            <h2 id="writing-criteria-title" className={ui.sectionTitle}>{w.criteriaTitle}</h2>
            <table className={ui.dataTable}>
              <caption className="sr-only">{w.criteriaCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{w.criterion}</th>
                  <th scope="col" className={ui.colNum}>{w.last}</th>
                  <th scope="col" className={ui.colNum}>{w.mean}</th>
                  <th scope="col" className={ui.colNum}>{w.n}</th>
                </tr>
              </thead>
              <tbody>
                {progress.criteria.map((criterion) => {
                  const low = weakest.includes(criterion.criterion);
                  return (
                    <tr key={criterion.criterion} className={low ? styles.weakestRow : undefined}>
                      <th scope="row">
                        {CRITERION_LABEL[criterion.criterion]}
                        {low && <>{' '}<span className={styles.weakestTag}>{w.lowest}</span></>}
                      </th>
                      <td className={ui.colNum}>{criterion.last === null ? '—' : decimal(criterion.last, t)}</td>
                      <td className={ui.colNum}>{criterion.mean === null ? '—' : average(criterion.mean, t)}</td>
                      <td className={ui.colNum}>{criterion.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className={styles.progressBlock} aria-labelledby="writing-chart-title">
            <div className={styles.chartHead}>
              <h2 id="writing-chart-title" className={ui.sectionTitle}>{w.chartTitle}</h2>
              <FilterBar>
                <FilterMenu
                  label={w.metric}
                  text={t.common.filterValue(w.metric, metricLabel(filters.metric))}
                  options={PROGRESS_METRICS.map((metric) => ({
                    key: metric, label: metricLabel(metric), href: href({ metric }), current: metric === filters.metric,
                  }))}
                />
                {(genres.length > 1 || filters.genre !== null) && (
                  <FilterMenu
                    label={w.type}
                    text={filters.genre === null ? w.type : t.common.filterValue(w.type, t.labels.genre[filters.genre])}
                    options={[
                      { key: 'all', label: w.allTypes, href: href({ genre: null }), current: filters.genre === null },
                      ...genres.map((genre) => ({
                        key: genre, label: t.labels.genre[genre], href: href({ genre }), current: genre === filters.genre,
                      })),
                    ]}
                    clear={filters.genre === null ? undefined : {
                      href: href({ genre: null }), label: t.common.removeFilter(t.labels.genre[filters.genre]),
                    }}
                  />
                )}
              </FilterBar>
            </div>
            {progress.points.length === 0 ? <p className={ui.help}>{w.empty}</p> : (
              <>
                <ProgressChart points={progress.points} metric={filters.metric} label={w.chartLabel(metricLabel(filters.metric))} t={t} />
                <p className={styles.progressLegend}>
                  <span className={styles.point} aria-hidden="true" /> {w.written}
                  <span className={styles.approxPoint} aria-hidden="true" /> {w.approximate}
                </p>
                <details className={ui.disclosure}>
                  <summary><ChevronRight size={14} className="chevron" aria-hidden="true" />{w.showData}</summary>
                  <div className={ui.scrollX}>
                    <table className={ui.dataTable}>
                      <caption className="sr-only">{w.tableCaption}</caption>
                      <thead><tr><th scope="col" className={ui.colDate}>{w.date}</th><th scope="col">{w.type}</th><th scope="col" className={ui.colNum}>{w.score}</th><th scope="col">{w.approximate}</th></tr></thead>
                      <tbody>
                        {progress.points.map((point) => {
                          const item = items.find(({ id }) => id === point.id);
                          return (
                            <tr key={point.id}>
                              <td className={ui.colDate}>{item === undefined ? mediumDate(point.date, t) : <Link href={writingHref(item.row.piece)}>{mediumDate(point.date, t)}</Link>}</td>
                              <td>{t.labels.genre[point.genre]}</td>
                              <td className={ui.colNum}>{decimal(point.value, t)}</td>
                              <td>{point.dateBasis === 'WRITTEN' ? w.written : w.approximate}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Decision({ items, filters, progress, t }: {
  readonly items: readonly LibraryItem[];
  readonly filters: ProgressFilters;
  readonly progress: ReturnType<typeof writingProgress>;
  readonly t: Messages;
}) {
  const w = t.writing.progress;
  const { focus } = progress;
  const list = (criteria: readonly WritingCriterion[]) =>
    new Intl.ListFormat(t.format.intl, { type: 'conjunction' }).format(criteria.map((criterion) => CRITERION_LABEL[criterion]));

  if (focus.kind === 'none') {
    return (
      <section className={ui.decision} aria-labelledby="writing-decision">
        <span className={ui.decisionKicker}>{w.kicker}</span>
        <h2 id="writing-decision" className={ui.decisionTitle}>{w.noneTitle}</h2>
        <p className={ui.decisionEvidence}>{w.noneBody}</p>
      </section>
    );
  }

  // Lo que se repasa: la redacción más reciente con anotaciones sin estudiar.
  const next = [...items].filter((item) => item.row.pending > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
  const others = progress.criteria
    .filter((criterion) => criterion.mean !== null && !(focus.kind === 'weakest' && focus.criteria.includes(criterion.criterion)))
    .map((criterion) => `${CRITERION_LABEL[criterion.criterion]} ${average(criterion.mean ?? 0, t)}`)
    .join(' · ');

  return (
    <section className={ui.decision} aria-labelledby="writing-decision">
      <span className={ui.decisionKicker}>{w.kicker}</span>
      <h2 id="writing-decision" className={ui.decisionTitle}>
        {focus.kind === 'even' ? w.evenTitle
          : focus.criteria.length === 1 ? w.weakestOne(list(focus.criteria)) : w.weakestMany(list(focus.criteria))}
      </h2>
      <p className={ui.decisionEvidence}>
        {focus.kind === 'even' ? w.evenEvidence(average(focus.low, t), average(focus.high, t))
          : w.weakestEvidence(average(focus.mean, t), others)}
        {next === undefined && ` ${w.nothingPending}`}
      </p>
      {next !== undefined && (
        <div className={ui.decisionActions}>
          <Link href={writingHref(next.row.piece)} className={ui.secondary}>{w.reviewPending(next.row.pending, next.title)}</Link>
        </div>
      )}
      <div className={ui.decisionCoverage}>
        <span>{w.assessed(progress.assessed)}</span>
        {progress.awaiting > 0 && <span>{w.awaiting(progress.awaiting)}</span>}
        {filters.genre !== null && <span>{w.onlyType(t.labels.genre[filters.genre])}</span>}
      </div>
    </section>
  );
}

/**
 * La evolución de una medida, en HTML y no en un SVG escalado: los puntos y las fechas se
 * colocan en porcentaje y el texto conserva su tamaño a cualquier anchura. Solo la línea es
 * SVG, estirada, con un trazo que no se deforma.
 */
function ProgressChart({ points, metric, label, t }: {
  readonly points: readonly ProgressPoint[];
  readonly metric: ProgressMetric;
  readonly label: string;
  readonly t: Messages;
}) {
  const max = metric === 'TOTAL' ? 20 : 5;
  const x = (index: number) => points.length <= 1 ? 50 : index * 100 / (points.length - 1);
  const y = (value: number) => (1 - value / max) * 100;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${String(x(index))},${String(y(point.value))}`).join(' ');
  // Con muchos puntos, las fechas se aclaran para no pisarse; la primera y la última siempre.
  const step = Math.max(1, Math.ceil(points.length / 6));
  const approximate = t.writing.progress.approximate;

  return (
    <div className={styles.chart} role="img" aria-label={label}>
      <div className={styles.chartPlot}>
        {[0, 0.25, 0.5, 0.75, 1].map((share) => (
          <div key={share} className={styles.chartTick} style={{ '--tick': String(y(max * share)) } as CSSProperties}>
            <span>{decimal(max * share, t)}</span>
          </div>
        ))}
        <div className={styles.chartField}>
          {points.length > 1 && (
            <svg className={styles.chartLine} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={line} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {points.map((point, index) => (
            <span key={point.id} className={styles.chartPoint} data-approximate={point.dateBasis === 'WRITTEN' ? undefined : 'true'}
              style={{ '--x': `${String(x(index))}%`, '--y': `${String(y(point.value))}%` } as CSSProperties}
              title={`${mediumDate(point.date, t)} · ${decimal(point.value, t)}${point.dateBasis === 'WRITTEN' ? '' : ` · ${approximate}`}`}>
              <span className={styles.chartValue}>{decimal(point.value, t)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className={styles.chartDates} aria-hidden="true">
        {points.map((point, index) => {
          const edge = index === 0 || index === points.length - 1;
          if (!edge && (index % step !== 0 || points.length - 1 - index < step)) return null;
          return (
            <span key={point.id} data-edge={edge ? 'true' : undefined} style={{ '--x': `${String(x(index))}%` } as CSSProperties}>
              {mediumDate(point.date, t)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
