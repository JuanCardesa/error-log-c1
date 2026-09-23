import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { CAUSE_META } from '@/lib/domain/enums';
import { ANKI_TARGET_PCT } from '@/lib/domain/thresholds';
import { q1CauseSplit } from '@/lib/queries/q1CauseSplit';
import { q2CategoryRate } from '@/lib/queries/q2CategoryRate';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { runRules } from '@/lib/rules';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { CATEGORY_LABELS, CAUSE_LABELS, SIDE_LABELS } from '../_shared/labels';
import { RulesTable } from './RulesTable';

/** Informe de reglas, práctica y repaso. */

export const dynamic = 'force-dynamic';

export default async function InformePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);
  const options = { now: new Date(), windowDays };

  const data = loadDataset(getDb());
  const q1 = q1CauseSplit(data, options);
  const q2 = q2CategoryRate(data, options);
  const q5 = q5AnkiDebt(data, options);
  const report = runRules(data, options);

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Informe</h1>
          <p className={shared.lede}>
            Últimos {windowDays} días. {q1.total} error{q1.total === 1 ? '' : 'es'} sobre{' '}
            {q2.itemsAttempted} ítems intentados.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/informe" />
      </header>

      <RulesTable report={report} pendingAnki={q5.pending} />

      <section className={`${ui.panel} ${shared.section}`} aria-labelledby="q1-heading">
        <div className={shared.panelHead}>
          <h2 id="q1-heading">Reparto de causas</h2>
          <p className={ui.note}>
            Estudio {q1.bySide.study}% · ejecución {q1.bySide.exec}%
          </p>
        </div>

        {q1.total === 0 ? (
          <p className={ui.empty}>Sin errores en la ventana.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="sr-only">Errores por causa</caption>
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Lado</th>
                  <th scope="col" className={ui.num}>
                    n
                  </th>
                  <th scope="col" className={ui.num}>
                    %
                  </th>
                  <th scope="col" className={shared.barCell}>
                    <span className="sr-only">Proporción</span>
                  </th>
                  <th scope="col">Remedio</th>
                </tr>
              </thead>
              <tbody>
                {q1.rows.map((row) => (
                  <tr key={row.cause}>
                    <td>{CAUSE_LABELS[row.cause]}</td>
                    <td>
                      <span
                        className={row.side === 'study' ? ui.chipStudy : ui.chipExec}
                      >
                        {SIDE_LABELS[row.side]}
                      </span>
                    </td>
                    <td className={ui.num}>{row.n}</td>
                    <td className={ui.num}>{row.pct}%</td>
                    <td>
                      <span
                        className={`${shared.bar} ${row.side === 'study' ? shared.barStudy : shared.barExec}`}
                        style={{ width: `${String(row.pct)}%` }}
                      />
                    </td>
                    <td className={ui.note}>{CAUSE_META[row.cause].remedy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${ui.panel} ${shared.section}`} aria-labelledby="q2-heading">
        <div className={shared.panelHead}>
          <h2 id="q2-heading">Categorías por tasa</h2>
          <p className={ui.note}>
            Normalizado por ítems intentados. Es el temario de los próximos sábados.
          </p>
        </div>

        {q2.rows.length === 0 ? (
          <p className={ui.empty}>
            Sin errores en sesiones con ítems contabilizados.
          </p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="sr-only">Categorías ordenadas por tasa</caption>
              <thead>
                <tr>
                  <th scope="col">Categoria</th>
                  <th scope="col" className={ui.num}>
                    Errores
                  </th>
                  <th scope="col" className={ui.num}>
                    Por 100 ítems
                  </th>
                  <th scope="col" className={shared.barCell}>
                    <span className="sr-only">Proporción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q2.rows.map((row, index) => (
                  <tr key={row.category}>
                    <td>{CATEGORY_LABELS[row.category]}</td>
                    <td className={ui.num}>{row.errors}</td>
                    <td className={ui.num}>{row.ratePer100}</td>
                    <td>
                      <span
                        className={shared.bar}
                        style={{
                          // Relativo a la peor categoria: compara entre si, no con 100.
                          width: `${String(
                            index === 0
                              ? 100
                              : Math.round(
                                  (row.ratePer100 / (q2.rows[0]?.ratePer100 ?? 1)) * 100,
                                ),
                          )}%`,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {q2.excludedErrors > 0 && (
          <p className={`${ui.note} ${shared.noteAfter}`}>
            {q2.excludedErrors} error{q2.excludedErrors === 1 ? '' : 'es'} de Writing fuera
            del cálculo: esas sesiones no tienen ítems que contar.
          </p>
        )}
      </section>

      <section className={`${ui.panel} ${shared.section}`} aria-labelledby="q5-heading">
        <div className={shared.panelHead}>
          <h2 id="q5-heading">Deuda de Anki</h2>
          <p className={ui.note}>Umbral {ANKI_TARGET_PCT}%</p>
        </div>

        {q5.pctConverted === null ? (
          <p className={ui.empty}>
            Ningún error de la ventana genera tarjeta. No hay deuda que medir.
          </p>
        ) : (
          <dl className={`${shared.panelHead} ${shared.figures}`}>
            <div>
              <dt className={ui.note}>Convertidos</dt>
              <dd className={`data ${shared.figureLead}`}>
                {q5.pctConverted}%
              </dd>
            </div>
            <div>
              <dt className={ui.note}>Elegibles</dt>
              <dd className="data">
                {q5.eligible}
              </dd>
            </div>
            <div>
              <dt className={ui.note}>Pendientes</dt>
              <dd className="data">
                {q5.pending}
              </dd>
            </div>
            <div>
              <dt className={ui.note}>Objetivo</dt>
              <dd>
                <span className={q5.meetsTarget === true ? ui.chipStudy : ui.chipExec}>
                  {q5.meetsTarget === true ? 'cumplido' : 'por debajo'}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
