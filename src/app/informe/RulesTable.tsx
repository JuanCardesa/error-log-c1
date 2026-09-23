import Link from 'next/link';

import { MIN_N } from '@/lib/domain/thresholds';
import type { RuleEvaluation, RulesReport } from '@/lib/rules';
import { RULE_SIGNAL_LABELS, RULE_STATUS_LABELS, categoryLabel } from '../_shared/labels';
import styles from './rules.module.css';
import ui from '../_shared/ui.module.css';

/** Destaca una sola acción según la prioridad del informe. */

/** La señal en palabras; si el motor añade una regla que la interfaz no conoce, la suya. */
function signalLabel(rule: RuleEvaluation): string {
  return RULE_SIGNAL_LABELS[rule.id] ?? rule.signal;
}

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

/**
 * Donde se hace la accion de cada regla, cuando tiene pantalla. Las demas piden cambiar
 * como se estudia y no hay sitio al que llevar: no se inventa un enlace.
 */
function actionLink(ruleId: number, pendingAnki: number): { href: string; label: string } | null {
  if (ruleId === 2) return { href: '/certezas', label: 'Ver las falsas certezas' };
  if (ruleId === 4) return { href: '/anki', label: `Ir a la cola de Anki · ${String(pendingAnki)} pendientes` };
  if (ruleId === 6) return { href: '/writing', label: 'Ver los textos de Writing' };
  return null;
}

export function RulesTable({ report, pendingAnki }: { readonly report: RulesReport; readonly pendingAnki: number }) {
  const link = report.doNow === null ? null : actionLink(report.doNow.id, pendingAnki);
  const { doNow, queued } = report;

  return (
    <section className={styles.rules} aria-labelledby="rules-heading">
      <div className={styles.headRow}>
        <h2 id="rules-heading">Qué hacer esta semana</h2>
      </div>

      {doNow === null ? (
        <p className={styles.nothing}>
          Ninguna regla se dispara. Sigue con el plan: no hay nada que corregir esta
          semana.
        </p>
      ) : (
        <div className={styles.doNow}>
          <span className={styles.doNowTag}>{RULE_STATUS_LABELS['DO NOW']}</span>
          <p className={styles.doNowAction}>{doNow.action}</p>
          <p className={styles.doNowWhy}>
            {signalLabel(doNow)}: {formatValue(doNow)} (umbral {formatThreshold(doNow)}, muestra
            de {doNow.sampleSize})
            {doNow.detail === null ? '' : ` · ${categoryLabel(doNow.detail)}`}
          </p>
          {link !== null && (
            <Link className={`${ui.primary} ${styles.doNowLink}`} href={link.href}>
              {link.label}
            </Link>
          )}
        </div>
      )}

      {queued.length > 0 && (
        <p className={styles.queuedNote}>
          {queued.length === 1 ? 'Otra regla se dispara' : `Otras ${String(queued.length)} reglas se disparan`}
          , pero esperan turno: dos acciones a la vez no se hacen ninguna.
        </p>
      )}

      {/* La tabla es el respaldo de la decision, no la decision: se abre si se pide. */}
      <details className={styles.details}>
        <summary>Ver las siete reglas y sus cifras</summary>

        <div className={`${ui.tableWrap} ${ui.framed} ${styles.tableGap}`}>
          <table className={ui.table}>
            <caption className="sr-only">Estado de las siete reglas de decisión</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Estado</th>
                <th scope="col">Señal</th>
                <th scope="col" className={ui.num}>
                  Valor
                </th>
                <th scope="col" className={ui.num}>
                  Umbral
                </th>
                <th scope="col" className={ui.num}>
                  Muestra
                </th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {report.rules.map((rule) => (
                <tr key={rule.id} className={rule.status === 'DO NOW' ? styles.rowDoNow : undefined}>
                  <td className="data">{rule.id}</td>
                  <td>
                    <span className={STATUS_CLASS[rule.status] ?? styles.stNeeds}>
                      {RULE_STATUS_LABELS[rule.status]}
                    </span>
                  </td>
                  <td>
                    {signalLabel(rule)}
                    {rule.detail === null ? '' : ` · ${categoryLabel(rule.detail)}`}
                  </td>
                  <td className={ui.num}>{formatValue(rule)}</td>
                  <td className={ui.num}>{formatThreshold(rule)}</td>
                  <td className={ui.num}>{rule.sampleSize}</td>
                  <td className={styles.action}>{rule.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.legend}>
          <strong>{RULE_STATUS_LABELS['needs n ≥ 15']}</strong> no es un fallo: con menos de
          {' '}{MIN_N} errores en la ventana un porcentaje es ruido, y actuar sobre ruido cuesta
          una semana de estudio. <strong>{RULE_STATUS_LABELS['n/a']}</strong> significa que todavía
          no hay datos de ese tipo.
        </p>
      </details>
    </section>
  );
}
