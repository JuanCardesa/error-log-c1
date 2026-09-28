import { MIN_N } from '@/lib/domain/thresholds';
import type { RuleEvaluation, RulesReport } from '@/lib/rules';
import type { Q5Result } from '@/lib/queries/q5AnkiDebt';
import { RULE_RECOMMENDATIONS, RULE_SIGNAL_LABELS, categoryLabel } from '../_shared/labels';

/**
 * Qué dice la banda de recomendación de Progreso. Distingue lo que el motor sabe de lo
 * que no: sin datos, con muestra insuficiente, con señales a vigilar o sin alertas no son
 * lo mismo, y ninguno se presenta como un buen resultado.
 *
 * La prioridad, los umbrales y las guardas son del motor; aquí solo se redacta.
 */

export interface Recommendation {
  readonly kicker: string;
  readonly title: string;
  readonly evidence: string;
  readonly action: { readonly href: string; readonly label: string } | null;
  /** Cifras de la regla que manda, para «Por qué esta recomendación». */
  readonly why: string | null;
}

export function formatValue(rule: RuleEvaluation): string {
  if (rule.value === null) return '—';
  return rule.unit === 'pct' ? `${String(rule.value).replace('.', ',')} %` : String(rule.value);
}

export function formatThreshold(rule: RuleEvaluation): string {
  const sign = rule.direction === 'above' ? (rule.inclusive ? '≥' : '>') : '<';
  return rule.unit === 'pct' ? `${sign} ${String(rule.threshold)} %` : `${sign} ${String(rule.threshold)}`;
}

export function signalLabel(rule: RuleEvaluation): string {
  return RULE_SIGNAL_LABELS[rule.id] ?? rule.signal;
}

export function recommendationTitle(rule: RuleEvaluation): string {
  const base = RULE_RECOMMENDATIONS[rule.id] ?? rule.action;
  return rule.id === 3 && rule.detail !== null ? `${base}: ${categoryLabel(rule.detail)}` : base;
}

function evidence(rule: RuleEvaluation, q5: Q5Result, windowDays: number): string {
  switch (rule.id) {
    case 4:
      // El denominador de la regla 4 son los errores elegibles, no el total.
      return `${String(q5.added)} de ${String(q5.eligible)} errores elegibles de los últimos ${String(windowDays)} días tienen tarjeta. En total hay ${String(q5.queue.length)} pendientes en la cola.`;
    case 2:
      return `${String(rule.value ?? 0)} errores registrados con confianza «Seguro» en los últimos 30 días.`;
    case 3:
      return `${rule.detail === null ? 'Una categoría' : categoryLabel(rule.detail)} reúne el ${formatValue(rule)} de ${String(rule.sampleSize)} errores del periodo.`;
    case 5:
      return `El ${formatValue(rule)} de ${String(rule.sampleSize)} errores de sesiones cronometradas llegó al final de la sesión.`;
    case 6:
      return `El ${formatValue(rule)} de ${String(rule.sampleSize)} errores de los textos originales reaparece en sus reescrituras.`;
    default:
      return `${signalLabel(rule)}: ${formatValue(rule)} sobre ${String(rule.sampleSize)} errores del periodo.`;
  }
}

function actionFor(rule: RuleEvaluation, windowDays: number): Recommendation['action'] {
  switch (rule.id) {
    case 2: return { href: '/certezas', label: 'Ver falsas certezas' };
    case 3: return rule.detail === null ? null : { href: `/errores?cat=${rule.detail}&w=${String(windowDays)}`, label: 'Ver sus errores' };
    case 4: return { href: '/anki', label: 'Ver pendientes' };
    case 6: return { href: '/writing?tab=reescrituras', label: 'Ver reescrituras' };
    default: return null;
  }
}

export function recommend(report: RulesReport, q5: Q5Result, totalErrors: number, windowDays: number): Recommendation {
  const winner = report.doNow;
  if (winner !== null) {
    // La regla 4 se mide sobre los errores elegibles de Q5, no sobre el total.
    const sample = winner.id === 4 ? `${String(q5.eligible)} errores elegibles` : String(winner.sampleSize);
    return {
      kicker: 'Recomendación principal · esta semana',
      title: recommendationTitle(winner),
      evidence: evidence(winner, q5, windowDays),
      action: actionFor(winner, windowDays),
      why: `Regla ${String(winner.id)} · ${signalLabel(winner)}: ${formatValue(winner)} (umbral ${formatThreshold(winner)}, muestra de ${sample}). Solo manda la de mayor prioridad entre las que se disparan.`,
    };
  }
  const watch = report.rules.filter((rule) => rule.status === 'WATCH');
  const short = report.rules.filter((rule) => rule.status === 'needs n ≥ 15');
  if (short.length > 0 && totalErrors < MIN_N) {
    return {
      kicker: 'Todavía sin recomendación',
      title: 'Falta muestra para estas recomendaciones',
      evidence: `Hay ${String(totalErrors)} ${totalErrors === 1 ? 'error' : 'errores'} en el periodo; las reglas de patrón necesitan al menos ${String(MIN_N)}. Sigue registrando también las sesiones sin errores.`,
      action: null,
      why: null,
    };
  }
  return {
    kicker: 'Sin acciones prioritarias',
    title: 'No se detectan acciones prioritarias en este periodo',
    evidence: watch.length > 0
      ? `Señales a vigilar: ${watch.map((rule) => signalLabel(rule).toLowerCase()).join('; ')}.`
      : 'Ninguna regla con datos suficientes se ha disparado.',
    action: null,
    why: null,
  };
}
