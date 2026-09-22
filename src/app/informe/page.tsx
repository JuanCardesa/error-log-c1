import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { compareAnkiPractice } from '@/lib/queries/q7AnkiReviews';
import { CAUSE_META } from '@/lib/domain/enums';
import { ANKI_TARGET_PCT } from '@/lib/domain/thresholds';
import { q1CauseSplit } from '@/lib/queries/q1CauseSplit';
import { q2CategoryRate } from '@/lib/queries/q2CategoryRate';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { runRules } from '@/lib/rules';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { RulesTable } from './RulesTable';

/**
 * Informe. Q1, Q2 y Q5 arriba como evidencia, y debajo la tabla de decision.
 *
 * El orden importa: primero lo que ha pasado, luego lo que hay que hacer. Las cifras
 * sin la accion son una base de datos de verguenza; la accion sin las cifras no se cree.
 */

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
  const anki = loadAnkiDataset(getDb());
  const comparison = compareAnkiPractice(data, anki, options);

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Informe</h1>
          <p className={shared.lede}>
            Ultimos {windowDays} dias. {q1.total} error{q1.total === 1 ? '' : 'es'} sobre{' '}
            {q2.itemsAttempted} items intentados.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/informe" />
      </header>

      <RulesTable report={report} />

      <section className={shared.panel} aria-labelledby="anki-comparison-heading">
        <h2 id="anki-comparison-heading">Práctica y repaso en Anki</h2>
        <p className={shared.note}>Errores registrados frente a respuestas «Again» en la misma ventana.
          Son recuentos con denominadores distintos; no son tasas comparables ni cambian la decisión del informe.
          La categoría de Anki se propone a partir de sus etiquetas.</p>
        {anki.sync?.lastSyncedAt == null ? <p className={shared.empty}>Todavía no has sincronizado Anki. Puedes hacerlo en la pestaña Anki.</p>
          : <>
            <p className={shared.note}>Datos de Anki sincronizados el {new Date(anki.sync.lastSyncedAt).toLocaleString('es-ES')}.</p>
            {comparison.length === 0 ? <p>Sin actividad en esta ventana.</p> : <div className={shared.tableWrap}>
              <table className={shared.table}>
                <caption className="sr-only">Errores de práctica y fallos en Anki por categoría</caption>
                <thead><tr><th scope="col">Categoría</th><th scope="col">Errores de práctica</th><th scope="col">Fallos en Anki</th><th scope="col">Repasos en Anki</th></tr></thead>
                <tbody>{comparison.map((row) => <tr key={row.category ?? 'SIN_MAPEAR'}>
                  <td>{row.category ?? 'Sin categoría asignada'}</td><td>{row.practiceErrors}</td><td>{row.ankiFailures}</td><td>{row.ankiReviews}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </>}
      </section>

      <section className={shared.panel} aria-labelledby="q1-heading">
        <div className={shared.panelHead}>
          <h2 id="q1-heading">Q1 · Reparto de causas</h2>
          <p className={shared.note}>
            Estudio {q1.bySide.study}% · ejecucion {q1.bySide.exec}%
          </p>
        </div>

        {q1.total === 0 ? (
          <p className={shared.empty}>Sin errores en la ventana.</p>
        ) : (
          <div className={shared.tableWrap}>
            <table className={shared.table}>
              <caption className="sr-only">Errores por causa</caption>
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Lado</th>
                  <th scope="col" className={shared.num}>
                    n
                  </th>
                  <th scope="col" className={shared.num}>
                    %
                  </th>
                  <th scope="col" className={shared.barCell}>
                    <span className="sr-only">Proporcion</span>
                  </th>
                  <th scope="col">Remedio</th>
                </tr>
              </thead>
              <tbody>
                {q1.rows.map((row) => (
                  <tr key={row.cause}>
                    <td className="data">{row.cause}</td>
                    <td>
                      <span
                        className={row.side === 'study' ? shared.chipStudy : shared.chipExec}
                      >
                        {row.side}
                      </span>
                    </td>
                    <td className={shared.num}>{row.n}</td>
                    <td className={shared.num}>{row.pct}%</td>
                    <td>
                      <span
                        className={`${shared.bar} ${row.side === 'study' ? shared.barStudy : shared.barExec}`}
                        style={{ width: `${String(row.pct)}%` }}
                      />
                    </td>
                    <td className={shared.note}>{CAUSE_META[row.cause].remedy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={shared.panel} aria-labelledby="q2-heading">
        <div className={shared.panelHead}>
          <h2 id="q2-heading">Q2 · Categorias por tasa</h2>
          <p className={shared.note}>
            Normalizado por items intentados. Es el temario de los proximos sabados.
          </p>
        </div>

        {q2.rows.length === 0 ? (
          <p className={shared.empty}>
            Sin errores en sesiones con items contabilizados.
          </p>
        ) : (
          <div className={shared.tableWrap}>
            <table className={shared.table}>
              <caption className="sr-only">Categorias ordenadas por tasa</caption>
              <thead>
                <tr>
                  <th scope="col">Categoria</th>
                  <th scope="col" className={shared.num}>
                    Errores
                  </th>
                  <th scope="col" className={shared.num}>
                    Por 100 items
                  </th>
                  <th scope="col" className={shared.barCell}>
                    <span className="sr-only">Proporcion</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q2.rows.map((row, index) => (
                  <tr key={row.category}>
                    <td className="data">{row.category}</td>
                    <td className={shared.num}>{row.errors}</td>
                    <td className={shared.num}>{row.ratePer100}</td>
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
          <p className={shared.note} style={{ marginTop: 'var(--sp-4)' }}>
            {q2.excludedErrors} error{q2.excludedErrors === 1 ? '' : 'es'} de Writing fuera
            del calculo: esas sesiones no tienen items que contar.
          </p>
        )}
      </section>

      <section className={shared.panel} aria-labelledby="q5-heading">
        <div className={shared.panelHead}>
          <h2 id="q5-heading">Q5 · Deuda de Anki</h2>
          <p className={shared.note}>Umbral {ANKI_TARGET_PCT}%</p>
        </div>

        {q5.pctConverted === null ? (
          <p className={shared.empty}>
            Ningun error de la ventana genera tarjeta. No hay deuda que medir.
          </p>
        ) : (
          <dl className={shared.panelHead}>
            <div>
              <dt className={shared.note}>Convertidos</dt>
              <dd className="data" style={{ fontSize: 'var(--fs-xl)', margin: 0 }}>
                {q5.pctConverted}%
              </dd>
            </div>
            <div>
              <dt className={shared.note}>Elegibles</dt>
              <dd className="data" style={{ margin: 0 }}>
                {q5.eligible}
              </dd>
            </div>
            <div>
              <dt className={shared.note}>Pendientes</dt>
              <dd className="data" style={{ margin: 0 }}>
                {q5.pending}
              </dd>
            </div>
            <div>
              <dt className={shared.note}>Objetivo</dt>
              <dd style={{ margin: 0 }}>
                <span className={q5.meetsTarget === true ? shared.chipStudy : shared.chipExec}>
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
