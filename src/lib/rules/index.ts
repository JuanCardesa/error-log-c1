import type { Dataset, QueryOptions } from '../domain/types';
import { measure } from './measurements';
import { type RulesReport, evaluateRules } from './rules';

export { measure, type RuleMeasurements } from './measurements';
export {
  NEEDS_N,
  PRIORITY,
  RULE_SPECS,
  type RuleEvaluation,
  type RuleStatus,
  type RulesReport,
  evaluateRules,
} from './rules';

/** Mide y decide en un paso. Es lo que consume la vista de Informe. */
export function runRules(data: Dataset, options: QueryOptions): RulesReport {
  return evaluateRules(measure(data, options));
}
