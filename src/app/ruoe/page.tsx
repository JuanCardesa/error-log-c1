import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { q3RuoeAccuracy } from '@/lib/queries/q3RuoeAccuracy';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import styles from './ruoe.module.css';

/**
 * Q3 · Precision RUOE por part y semana ISO.
 *
 * Las celdas sin datos van vacias, no a cero: no haber practicado una part esa semana
 * no es lo mismo que haberla fallado entera, y no pueden pintarse igual.
 */

export const dynamic = 'force-dynamic';

/** Del rojo al verde segun el porcentaje. Solo color de fondo: el numero manda. */
function cellClass(pct: number): string {
  if (pct >= 85) return styles.tierHigh ?? '';
  if (pct >= 70) return styles.tierMid ?? '';
  if (pct >= 50) return styles.tierLow ?? '';
  return styles.tierBad ?? '';
}

export default async function RuoePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);

  const data = loadDataset(getDb());
  const q3 = q3RuoeAccuracy(data, { now: new Date(), windowDays });

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>RUOE</h1>
          <p className={shared.lede}>
            Precision por part y semana ISO en los ultimos {windowDays} dias. Es la vista
            que dice si semanas de drills de una part han servido de algo.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/ruoe" />
      </header>

      {q3.rows.length === 0 ? (
        <p className={ui.empty}>
          Sin sesiones de RUOE con items en la ventana. Prueba a ampliarla a 60 dias.
        </p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={styles.matrix}>
            <caption className="sr-only">
              Precision por part y semana. Las celdas vacias no tienen datos.
            </caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                {q3.weeks.map((week) => (
                  <th key={week} scope="col" className={styles.weekHead}>
                    {week}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q3.rows.map((row) => (
                <tr key={row.part}>
                  <th scope="row" className="data">
                    P{row.part}
                  </th>
                  {row.cells.map((cell, index) => {
                    const week = q3.weeks[index] ?? String(index);
                    if (cell === null) {
                      return (
                        <td key={week} className={styles.blank}>
                          <span className="sr-only">Sin datos</span>
                        </td>
                      );
                    }
                    return (
                      <td key={week} className={`${styles.cell} ${cellClass(cell.pct)}`}>
                        <span className={styles.pct}>{cell.pct}%</span>
                        <span className={styles.ratio}>
                          {cell.correct}/{cell.total}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
