import Link from 'next/link';

import { GENRES } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';
import { PROGRESS_METRICS, writingProgress, type ProgressFilters, type ProgressMetric } from '@/lib/writing/progress';
import { decimal, mediumDate } from '../_shared/format';
import ui from '../_shared/ui.module.css';
import { writingHref } from '@/lib/writing/urls';
import type { LibraryItem } from './entries';
import styles from './writing.module.css';

export function ProgressView({ items, filters, t }: {
  readonly items: readonly LibraryItem[];
  readonly filters: ProgressFilters;
  readonly t: Messages;
}) {
  const w = t.writing.progress;
  const rows = items.map(({ row }) => row.piece);
  const progress = writingProgress(rows, filters);
  const metricLabel = w.metrics[filters.metric];

  return (
    <section className={styles.progress} aria-labelledby="writing-progress-title">
      <h2 id="writing-progress-title" className="sr-only">{w.title}</h2>
      <div className={styles.progressSummary} aria-label={w.title}>
        <p><strong>{progress.count}</strong><span>{w.count(progress.count)}</span></p>
        <p><strong>{progress.corrected}</strong><span>{w.corrected(progress.corrected)}</span></p>
        <p><strong>{progress.awaiting}</strong><span>{w.awaiting(progress.awaiting)}</span></p>
      </div>

      <form className={styles.progressFilters} action="/writing" method="get">
        <input type="hidden" name="tab" value="progreso" />
        <label className={ui.field}>
          <span>{w.metric}</span>
          <select name="measure" className={ui.select} defaultValue={filters.metric}>
            {PROGRESS_METRICS.map((metric) => <option key={metric} value={metric}>{w.metrics[metric]}</option>)}
          </select>
        </label>
        <label className={ui.field}>
          <span>{w.type}</span>
          <select name="type" className={ui.select} defaultValue={filters.genre ?? ''}>
            <option value="">{w.allTypes}</option>
            {GENRES.map((genre) => <option key={genre} value={genre}>{t.labels.genre[genre]}</option>)}
          </select>
        </label>
        <label className={ui.field}>
          <span>{w.from}</span>
          <input type="date" name="from" className={ui.input} defaultValue={filters.from ?? ''} max={filters.to ?? undefined} />
        </label>
        <label className={ui.field}>
          <span>{w.to}</span>
          <input type="date" name="to" className={ui.input} defaultValue={filters.to ?? ''} min={filters.from ?? undefined} />
        </label>
        <button type="submit" className={ui.secondary}>{w.apply}</button>
      </form>

      <section className={styles.progressPanel} aria-label={w.chartLabel(metricLabel)}>
        <header className={styles.progressPanelHead}>
          <h3>{w.chartLabel(metricLabel)}</h3>
          <p className={styles.progressLegend}>
            <span className={styles.point} aria-hidden="true" /> {w.written}
            <span className={styles.approxPoint} aria-hidden="true" /> {w.approximate}
          </p>
        </header>
        {progress.points.length === 0 ? <p className={styles.empty}>{w.empty}</p> : (
          <>
            <ProgressChart points={progress.points} metric={filters.metric} t={t} />
            <details className={styles.progressData}>
              <summary>{w.showData}</summary>
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

      <section className={styles.progressPanel} aria-labelledby="writing-criteria-title">
        <h3 id="writing-criteria-title">{w.criteriaTitle}</h3>
        <div className={ui.scrollX}>
          <table className={ui.dataTable}>
            <thead><tr><th scope="col">{w.criterion}</th><th scope="col" className={ui.colNum}>{w.mean}</th><th scope="col" className={ui.colNum}>{w.n}</th><th scope="col" className={ui.colNum}>{w.last}</th></tr></thead>
            <tbody>
              {progress.criteria.map((criterion) => (
                <tr key={criterion.criterion}>
                  <th scope="row">{w.metrics[criterion.criterion]}</th>
                  <td className={ui.colNum}>{criterion.mean === null ? '—' : decimal(criterion.mean, t, 2)}</td>
                  <td className={ui.colNum}>{criterion.count}</td>
                  <td className={ui.colNum}>{criterion.last === null ? '—' : decimal(criterion.last, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.progressHighlights}>
          <h4>{w.highlights}</h4>
          {progress.strongest === null || progress.mostRoomToImprove === null ? <p>{w.noHighlights}</p> : (
            <dl>
              <div><dt>{w.strongest}</dt><dd>{w.metrics[progress.strongest]}</dd></div>
              <div><dt>{w.room}</dt><dd>{w.metrics[progress.mostRoomToImprove]}</dd></div>
            </dl>
          )}
        </div>
      </section>
    </section>
  );
}

function ProgressChart({ points, metric, t }: {
  readonly points: readonly WritingProgressPoint[];
  readonly metric: ProgressMetric;
  readonly t: Messages;
}) {
  const label = t.writing.progress.chartLabel(t.writing.progress.metrics[metric]);
  const max = metric === 'TOTAL' ? 20 : 5;
  const height = 320;
  const left = 48;
  const right = 24;
  const top = 22;
  const bottom = 66;
  const width = Math.max(720, left + right + Math.max(1, points.length - 1) * 88);
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index: number) => left + (points.length <= 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const y = (value: number) => top + (max - value) / max * plotHeight;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const tProgress = t.writing.progress;

  return (
    <div className={styles.progressChartScroll}>
      <svg className={styles.progressChart} role="img" aria-label={label} viewBox={`0 0 ${String(width)} ${String(height)}`}>
        <title>{label}</title>
        <desc>{tProgress.tableCaption}</desc>
        {[0, 1, 2, 3, 4].map((step) => {
          const value = max * step / 4;
          const tick = Number.isInteger(value) ? String(value) : decimal(value, t, 2);
          return <g key={step}><line className={styles.chartGrid} x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className={styles.chartAxis} x={left - 10} y={y(value) + 4} textAnchor="end">{tick}</text></g>;
        })}
        {points.length > 1 && <path className={styles.chartLine} d={line} />}
        {points.map((point, index) => {
          const approximate = point.dateBasis !== 'WRITTEN';
          return (
            <g key={point.id}>
              <circle className={approximate ? styles.approxPoint : styles.point} cx={x(index)} cy={y(point.value)} r={6}>
                <title>{`${mediumDate(point.date, t)} · ${decimal(point.value, t)}${approximate ? ` · ${tProgress.approximate}` : ''}`}</title>
              </circle>
              <text className={styles.chartDate} x={x(index)} y={height - 35} textAnchor="middle">{mediumDate(point.date, t)}</text>
              <text className={styles.chartValue} x={x(index)} y={y(point.value) - 10} textAnchor="middle">{decimal(point.value, t)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type WritingProgressPoint = ReturnType<typeof writingProgress>['points'][number];
