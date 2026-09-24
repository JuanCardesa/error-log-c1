import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { q3RuoeAccuracy } from '@/lib/queries/q3RuoeAccuracy';
import { sliceWindow } from '@/lib/queries/window';
import { percent, sessionTitle, shortDate } from '../_shared/format';
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
  const windowDays = parseWindow(params['w']);
  const now = new Date();
  const data = loadDataset(getDb());
  const q3 = q3RuoeAccuracy(data, { now, windowDays });
  const weeks = windowWeeks(now, windowDays);
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
        label: percent(cell.pct),
        correct: cell.correct,
        total: cell.total,
        sessions: sessionsInCell(sessions, row.part, week).map((session) => ({
          id: session.id,
          title: sessionTitle(session),
          date: shortDate(session.date),
        })),
      };
    }),
  }));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1 className={ui.pageTitle}>Progreso</h1>
          <WindowSwitch current={windowDays} basePath="/ruoe" />
        </div>
        <RouteTabs
          label="Vistas de progreso"
          items={[
            { href: `/informe${w}`, label: 'Resumen', current: false },
            { href: `/ruoe${w}`, label: 'Reading & Use of English', current: true },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <p>Sin sesiones de Reading & Use of English con ítems en los últimos {windowDays} días.</p>
          {windowDays === 30
            ? <Link href="/ruoe?w=60" className={ui.textLink}>Ver los últimos 60 días</Link>
            : <Link href="/registrar" className={ui.textLink}>Ir a Sesiones</Link>}
        </div>
      ) : (
        <RuoeMatrix weeks={weeks.map(({ iso, range, partial }) => ({ iso, range, partial }))} rows={rows} />
      )}
    </div>
  );
}
