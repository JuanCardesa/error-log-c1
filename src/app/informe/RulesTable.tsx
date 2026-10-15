import { ChevronRight } from 'lucide-react';

import { MIN_N } from '@/lib/domain/thresholds';
import type { Messages } from '@/lib/i18n';
import type { RulesReport } from '@/lib/rules';
import { categoryLabel } from '../_shared/labels';
import ui from '../_shared/ui.module.css';
import { formatThreshold, formatValue, recommendationTitle, signalLabel } from './recommendation';
import styles from './progreso.module.css';

/**
 * Las siete reglas con su muestra, umbral y estado. Es el respaldo de la decisión, no la
 * decisión: se abre si se pide.
 */
export function RulesDetails({ report, t }: { readonly report: RulesReport; readonly t: Messages }) {
  return (
    <details className={`${ui.disclosure} ${styles.rulesBox}`}>
      <summary>
        <ChevronRight size={14} className="chevron" aria-hidden="true" />
        {t.progress.rulesSummary}
      </summary>
      <div className={styles.rulesWrap}>
        <table className={styles.rulesTable}>
          <caption className="sr-only">{t.progress.rulesCaption}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t.sessionView.status}</th>
              <th scope="col">{t.progress.signal}</th>
              <th scope="col" className={styles.num}>{t.progress.value}</th>
              <th scope="col" className={styles.num}>{t.progress.threshold}</th>
              <th scope="col" className={styles.num}>{t.progress.sample}</th>
              <th scope="col">{t.progress.recommendation}</th>
            </tr>
          </thead>
          <tbody>
            {report.rules.map((rule) => (
              <tr key={rule.id} className={rule.status === 'DO NOW' ? styles.ruleWinner : undefined}>
                <td className={styles.mono}>{rule.id}</td>
                <td className={rule.status === 'DO NOW' ? styles.ruleNow : undefined}>{t.labels.ruleStatus[rule.status]}</td>
                <td>
                  {signalLabel(rule, t)}
                  {rule.detail === null ? '' : ` · ${categoryLabel(rule.detail, t)}`}
                </td>
                <td className={styles.num}>{formatValue(rule, t)}</td>
                <td className={styles.num}>{formatThreshold(rule, t)}</td>
                <td className={styles.num}>{rule.sampleSize}</td>
                <td>{recommendationTitle(rule, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${ui.help} ${styles.rulesNote}`}>
        {t.progress.rulesNote(t.labels.ruleStatus['needs n ≥ 15'], MIN_N, t.labels.ruleStatus['n/a'])}
      </p>
    </details>
  );
}
