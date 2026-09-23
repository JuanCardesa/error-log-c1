import type { Category } from '../domain/enums';
import type { Dataset, QueryOptions } from '../domain/types';
import { q4FalseCertainties } from '../queries/q4FalseCertainties';
import { q5AnkiDebt } from '../queries/q5AnkiDebt';
import { q6RewriteEfficacy } from '../queries/q6RewriteEfficacy';
import { percentage, sliceWindow } from '../queries/window';

/**
 * Las cifras que alimentan el motor de reglas, separadas de la decision.
 *
 * Medir y decidir son dos cosas distintas: partirlas permite testear cada regla en sus
 * cuatro estados con numeros escritos a mano, sin montar un dataset que produzca justo
 * el 41% que hace falta.
 */

export interface RuleMeasurements {
  /** Denominador de las reglas 0, 1 y 3. */
  readonly totalErrors: number;
  /** Regla 0: DESPISTE + TIEMPO sobre el total. Ojo: no es todo el lado `exec`. */
  readonly despisteTiempoPct: number;
  /** Regla 1. */
  readonly desconocimientoPct: number;
  /** Regla 2: conteo absoluto en 30 dias fijos. */
  readonly seguroCount: number;
  /** Regla 3: la categoria mas repetida y su peso sobre el total de errores. */
  readonly topCategory: { readonly category: Category; readonly pct: number } | null;
  /** Regla 4: Q5. `null` si no hay errores que generen tarjeta. */
  readonly ankiPct: number | null;
  /** Regla 5: denominador restringido a sesiones cronometradas (decision P3). */
  readonly timedErrors: number;
  readonly latePct: number | null;
  /** Regla 6. */
  readonly rewritePairs: number;
  readonly rewriteOriginalErrors: number;
  readonly rewriteRepeatedPct: number | null;
}

export function measure(data: Dataset, options: QueryOptions): RuleMeasurements {
  const { pairs } = sliceWindow(data, options.now, options.windowDays);
  const totalErrors = pairs.length;

  let despisteTiempo = 0;
  let desconocimiento = 0;
  let timedErrors = 0;
  let lateErrors = 0;
  const byCategory = new Map<Category, number>();

  for (const { error, session } of pairs) {
    if (error.cause === 'DESPISTE' || error.cause === 'TIEMPO') despisteTiempo += 1;
    if (error.cause === 'DESCONOCIMIENTO') desconocimiento += 1;

    byCategory.set(error.category, (byCategory.get(error.category) ?? 0) + 1);

    // `late_in_session` solo significa algo si hubo cronometro.
    if (session.timed) {
      timedErrors += 1;
      if (error.lateInSession) lateErrors += 1;
    }
  }

  let topCategory: { category: Category; pct: number } | null = null;
  for (const [category, count] of byCategory) {
    const pct = percentage(count, totalErrors);
    if (topCategory === null || pct > topCategory.pct) topCategory = { category, pct };
  }

  const anki = q5AnkiDebt(data, options);
  const rewrite = q6RewriteEfficacy(data, options);

  return {
    totalErrors,
    despisteTiempoPct: percentage(despisteTiempo, totalErrors),
    desconocimientoPct: percentage(desconocimiento, totalErrors),
    // Ventana fija de 30 dias, no la conmutable (decision P2).
    seguroCount: q4FalseCertainties(data, { now: options.now }).length,
    topCategory,
    ankiPct: anki.pctConverted,
    timedErrors,
    latePct: timedErrors === 0 ? null : percentage(lateErrors, timedErrors),
    rewritePairs: rewrite.pairs.length,
    rewriteOriginalErrors: rewrite.totalOriginalErrors,
    rewriteRepeatedPct: rewrite.pctRepeated,
  };
}
