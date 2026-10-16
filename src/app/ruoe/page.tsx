import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { q3RuoeAccuracy } from '@/lib/queries/q3RuoeAccuracy';
import { sliceWindow } from '@/lib/queries/window';
import { percent, sessionTitle, shortDate } from '../_shared/format';
import { EmptyState } from '../_shared/EmptyState';
import { getT } from '../_shared/i18nServer';
import { PageHeader } from '../_shared/PageHeader';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import { sessionsInCell, windowWeeks } from '../_shared/weeks';
import { RuoeMatrix } from './RuoeMatrix';
import styles from './ruoe.module.css';

/**
 * Q3 · Precisión de Reading & Use of English por part y semana. Las cifras son de Q3; el
 * eje de semanas es continuo solo al presentarlo, para que una semana sin práctica se vea
 * como hueco y no como continuidad.
 */

export const dynamic = 'force-dynamic';

export default async function RuoePage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const windowDays = parseWindow(params['w']);
  const now = new Date();
  const data = loadDataset(getDb());
  const q3 = q3RuoeAccuracy(data, { now, windowDays });
  const weeks = windowWeeks(now, windowDays, t);
  const { sessions } = sliceWindow(data, now, windowDays);
  const w = windowDays === 30 ? '' : `?w=${String(windowDays)}`;

  const rows = q3.rows.map((row) => ({
    part: row.part,
    cells: weeks.map((week) => {
      const index = q3.weeks.indexOf(week.iso);
      const cell = index < 0 ? null : row.cells[index] ?? null;
      if (cell === null) return null;
      return {
        pct: cell.pct,
        label: percent(cell.pct, t),
        correct: cell.correct,
        total: cell.total,
        sessions: sessionsInCell(sessions, row.part, week).map((session) => ({
          id: session.id,
          title: sessionTitle(session, t),
          date: shortDate(session.date, t),
        })),
      };
    }),
  }));

  return (
    <div className={styles.page}>
      <PageHeader
        title={t.nav.progress}
        actions={<WindowSwitch current={windowDays} basePath="/ruoe" />}
        tabs={(
          <RouteTabs
            label={t.progress.views}
            items={[
              { href: `/informe${w}`, label: t.progress.summary, current: false },
              { href: `/ruoe${w}`, label: t.labels.paperLong.RUOE, current: true },
            ]}
          />
        )}
      />

      {rows.length === 0 ? (
        <EmptyState
          cause={t.ruoe.empty(windowDays)}
          action={windowDays === 30
            ? <Link href="/ruoe?w=60" className={ui.textLink}>{t.ruoe.see60}</Link>
            : <Link href="/registrar" className={ui.textLink}>{t.common.goToSessions}</Link>}
        />
      ) : (
        <RuoeMatrix weeks={weeks.map(({ iso, range, partial }) => ({ iso, range, partial }))} rows={rows} />
      )}
    </div>
  );
}
