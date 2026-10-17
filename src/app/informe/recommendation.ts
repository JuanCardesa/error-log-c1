import { MIN_N } from '@/lib/domain/thresholds';
import type { Messages } from '@/lib/i18n';
import type { RuleEvaluation, RulesReport } from '@/lib/rules';
import type { Q5Result } from '@/lib/queries/q5AnkiDebt';
import { percent } from '../_shared/format';
import { categoryLabel, ruleRecommendationLabel, ruleSignalLabel } from '../_shared/labels';

/**
 * Qué dice la banda de recomendación de Progreso. Distingue lo que el motor sabe de lo
 * que no: sin datos, con muestra insuficiente, con señales a vigilar o sin alertas no son
 * lo mismo, y ninguno se presenta como un buen resultado.
 *
 * La prioridad, los umbrales y las guardas son del motor; aquí solo se redacta, en el
 * idioma de la interfaz.
 */

export interface Recommendation {
  readonly kicker: string;
  readonly title: string;
  readonly evidence: string;
  readonly action: { readonly href: string; readonly label: string } | null;
  /** Cifras de la regla que manda, para «Por qué esta recomendación». */
  readonly why: string | null;
}

export function formatValue(rule: RuleEvaluation, t: Messages): string {
  if (rule.value === null) return '—';
  return rule.unit === 'pct' ? percent(rule.value, t) : String(rule.value);
}

export function formatThreshold(rule: RuleEvaluation, t: Messages): string {
  const sign = rule.direction === 'above' ? (rule.inclusive ? '≥' : '>') : '<';
  return rule.unit === 'pct' ? `${sign} ${percent(rule.threshold, t)}` : `${sign} ${String(rule.threshold)}`;
}

export function signalLabel(rule: RuleEvaluation, t: Messages): string {
  return ruleSignalLabel(rule.id, t) ?? rule.signal;
}

export function recommendationTitle(rule: RuleEvaluation, t: Messages): string {
  const base = ruleRecommendationLabel(rule.id, t) ?? rule.action;
  return rule.id === 3 && rule.detail !== null ? `${base}: ${categoryLabel(rule.detail, t)}` : base;
}

function evidence(rule: RuleEvaluation, q5: Q5Result, windowDays: number, t: Messages): string {
  const p = t.progress;
  switch (rule.id) {
    case 4:
      // El denominador de la regla 4 son los errores elegibles, no el total.
      return p.evidenceAnki(q5.added, q5.eligible, windowDays, q5.queue.length);
    case 2:
      return p.evidenceSure(rule.value ?? 0);
    case 3:
      return p.evidenceCategory(rule.detail === null ? null : categoryLabel(rule.detail, t), formatValue(rule, t), rule.sampleSize);
    case 5:
      return p.evidenceLate(formatValue(rule, t), rule.sampleSize);
    case 6:
      return p.evidenceRewrite(formatValue(rule, t), rule.sampleSize);
    default:
      return p.evidenceDefault(signalLabel(rule, t), formatValue(rule, t), rule.sampleSize);
  }
}

function actionFor(rule: RuleEvaluation, windowDays: number, t: Messages): Recommendation['action'] {
  switch (rule.id) {
    case 2: return { href: '/certezas', label: t.progress.seeFalseCertainties };
    case 3: return rule.detail === null ? null : { href: `/errores?cat=${rule.detail}&w=${String(windowDays)}`, label: t.progress.seeItsErrors };
    case 4: return { href: '/anki', label: t.progress.seePending };
    case 6: return { href: '/writing?tab=reescrituras', label: t.progress.seeRewrites };
    default: return null;
  }
}

export function recommend(report: RulesReport, q5: Q5Result, totalErrors: number, windowDays: number, t: Messages): Recommendation {
  const p = t.progress;
  const winner = report.doNow;
  if (winner !== null) {
    // La regla 4 se mide sobre los errores elegibles de Q5, no sobre el total.
    const sample = winner.id === 4 ? p.eligibleErrors(q5.eligible) : String(winner.sampleSize);
    return {
      kicker: p.kickerMain,
      title: recommendationTitle(winner, t),
      evidence: evidence(winner, q5, windowDays, t),
      action: actionFor(winner, windowDays, t),
      why: p.why(winner.id, signalLabel(winner, t), formatValue(winner, t), formatThreshold(winner, t), sample),
    };
  }
  const watch = report.rules.filter((rule) => rule.status === 'WATCH');
  const short = report.rules.filter((rule) => rule.status === 'needs n ≥ 15');
  if (short.length > 0 && totalErrors < MIN_N) {
    return {
      kicker: p.kickerNone,
      title: p.titleShort,
      evidence: p.evidenceShort(totalErrors, MIN_N),
      action: null,
      why: null,
    };
  }
  return {
    kicker: p.kickerOk,
    title: p.titleOk,
    evidence: watch.length > 0
      ? p.watchSignals(watch.map((rule) => signalLabel(rule, t).toLowerCase()).join('; '))
      : p.noneFired,
    action: null,
    why: null,
  };
}
