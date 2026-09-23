import { MIN_N } from '@/lib/domain/thresholds';
import type { RuleEvaluation, RulesReport } from '@/lib/rules';
import styles from './rules.module.css';

/** Destaca una sola acción según la prioridad del informe. */

function formatValue(rule: RuleEvaluation): string {
  if (rule.value === null) return '—';
  return rule.unit === 'pct' ? `${String(rule.value)}%` : String(rule.value);
}

function formatThreshold(rule: RuleEvaluation): string {
  const sign = rule.direction === 'above' ? (rule.inclusive ? '≥' : '>') : '<';
  return rule.unit === 'pct'
    ? `${sign} ${String(rule.threshold)}%`
    : `${sign} ${String(rule.threshold)}`;
}

const STATUS_CLASS: Record<string, string | undefined> = {
  'DO NOW': styles.stDoNow,
  QUEUED: styles.stQueued,
  WATCH: styles.stWatch,
  ok: styles.stOk,
  'n/a': styles.stNa,
};

export function RulesTable({ report }: { readonly report: RulesReport }) {
  const { doNow, queued } = report;

  return (
    <section aria-labelledby="rules-heading">
      <div className={styles.headRow}>
        <h2 id="rules-heading">Que cambio esta semana</h2>
      </div>

      {doNow === null ? (
        <p className={styles.nothing}>
          Ninguna regla se dispara. Sigue con el plan: no hay nada que corregir esta
          semana.
        </p>
      ) : (
        <div className={styles.doNow}>
          <span className={styles.doNowTag}>DO NOW</span>
          <p className={styles.doNowAction}>{doNow.action}</p>
          <p className={styles.doNowWhy}>
            <span className="data">{doNow.signal}</span>: {formatValue(doNow)} (umbral{' '}
            {formatThreshold(doNow)}, n = {doNow.sampleSize})
            {doNow.detail === null ? '' : ` · ${doNow.detail}`}
          </p>
        </div>
      )}

      {queued.length > 0 && (
        <p className={styles.queuedNote}>
          {queued.length === 1 ? 'Otra regla se dispara' : `Otras ${String(queued.length)} reglas se disparan`}
          , pero esperan turno: dos acciones a la vez no se hacen ninguna.
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Estado de las siete reglas de decision</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Estado</th>
              <th scope="col">Señal</th>
              <th scope="col" className={styles.num}>
                Valor
              </th>
              <th scope="col" className={styles.num}>
                Umbral
              </th>
              <th scope="col" className={styles.num}>
                n
              </th>
              <th scope="col">Accion</th>
            </tr>
          </thead>
          <tbody>
            {report.rules.map((rule) => (
              <tr key={rule.id} className={rule.status === 'DO NOW' ? styles.rowDoNow : undefined}>
                <td className="data">{rule.id}</td>
                <td>
                  <span className={STATUS_CLASS[rule.status] ?? styles.stNeeds}>
                    {rule.status}
                  </span>
                </td>
                <td>
                  {rule.signal}
                  {rule.detail === null ? '' : ` · ${rule.detail}`}
                </td>
                <td className={styles.num}>{formatValue(rule)}</td>
                <td className={styles.num}>{formatThreshold(rule)}</td>
                <td className={styles.num}>{rule.sampleSize}</td>
                <td className={styles.action}>{rule.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.legend}>
        <strong>needs n ≥ {MIN_N}</strong> no es un fallo: con menos de {MIN_N} errores en
        la ventana un porcentaje es ruido, y actuar sobre ruido cuesta una semana de
        estudio. <strong>n/a</strong> significa que no hay datos de ese tipo todavia.
      </p>
    </section>
  );
}
