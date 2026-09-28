import { ChevronRight } from 'lucide-react';

import { MIN_N } from '@/lib/domain/thresholds';
import type { RulesReport } from '@/lib/rules';
import { RULE_STATUS_LABELS, categoryLabel } from '../_shared/labels';
import ui from '../_shared/ui.module.css';
import { formatThreshold, formatValue, recommendationTitle, signalLabel } from './recommendation';
import styles from './progreso.module.css';

/**
 * Las siete reglas con su muestra, umbral y estado. Es el respaldo de la decisión, no la
 * decisión: se abre si se pide.
 */
export function RulesDetails({ report }: { readonly report: RulesReport }) {
  return (
    <details className={`${ui.disclosure} ${styles.rulesBox}`}>
      <summary>
        <ChevronRight size={14} className="chevron" aria-hidden="true" />
        Ver las siete reglas y sus umbrales
      </summary>
      <div className={styles.rulesWrap}>
        <table className={styles.rulesTable}>
          <caption className="sr-only">Estado de las siete reglas de decisión</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Estado</th>
              <th scope="col">Señal</th>
              <th scope="col" className={styles.num}>Valor</th>
              <th scope="col" className={styles.num}>Umbral</th>
              <th scope="col" className={styles.num}>Muestra</th>
              <th scope="col">Recomendación</th>
            </tr>
          </thead>
          <tbody>
            {report.rules.map((rule) => (
              <tr key={rule.id} className={rule.status === 'DO NOW' ? styles.ruleWinner : undefined}>
                <td className={styles.mono}>{rule.id}</td>
                <td className={rule.status === 'DO NOW' ? styles.ruleNow : undefined}>{RULE_STATUS_LABELS[rule.status]}</td>
                <td>
                  {signalLabel(rule)}
                  {rule.detail === null ? '' : ` · ${categoryLabel(rule.detail)}`}
                </td>
                <td className={styles.num}>{formatValue(rule)}</td>
                <td className={styles.num}>{formatThreshold(rule)}</td>
                <td className={styles.num}>{rule.sampleSize}</td>
                <td>{recommendationTitle(rule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${ui.help} ${styles.rulesNote}`}>
        Solo manda la de mayor prioridad entre las que se disparan. «{RULE_STATUS_LABELS['needs n ≥ 15']}» no es un fallo:
        con menos de {MIN_N} errores un porcentaje es ruido. «{RULE_STATUS_LABELS['n/a']}» significa que todavía no hay
        datos de ese tipo.
      </p>
    </details>
  );
}
