import { ANKI_TARGET_PCT, MIN_N, REWRITE_REPEAT_PCT } from '../domain/thresholds';
import type { RuleMeasurements } from './measurements';

/**
 * Motor de decision (SPEC §5).
 *
 * Siete reglas. De las que se disparan, **solo una** queda como `DO NOW` —la primera en
 * el orden de prioridad— y el resto pasan a `QUEUED`. Ese es el punto entero del motor:
 * un informe que enseña cinco acciones urgentes a la vez no ha decidido nada.
 */

export type RuleStatus = 'DO NOW' | 'QUEUED' | 'WATCH' | 'ok' | 'needs n ≥ 15' | 'n/a';

export const NEEDS_N: RuleStatus = 'needs n ≥ 15';

/** Cuando el umbral se cruza por abajo (regla 4) en vez de por arriba. */
type Direction = 'above' | 'below';

interface RuleSpec {
  readonly id: number;
  readonly signal: string;
  readonly action: string;
  readonly threshold: number;
  readonly watch: number;
  readonly unit: 'pct' | 'count';
  readonly direction: Direction;
  /** `true` cuando el umbral se enuncia con "≥"/"≤" y no con ">"/"<". */
  readonly inclusive: boolean;
  /** Si le aplica la guarda de `MIN_N`. Las reglas de conteo absoluto no. */
  readonly guarded: boolean;
  /** Valor medido, o `null` si la regla no aplica a estos datos. */
  readonly read: (m: RuleMeasurements) => number | null;
  /** Denominador propio de la regla, para la guarda de `MIN_N`. */
  readonly sampleSize: (m: RuleMeasurements) => number;
  readonly detail?: (m: RuleMeasurements) => string | null;
}

export const RULE_SPECS: readonly RuleSpec[] = [
  {
    id: 0,
    signal: 'DESPISTE + TIEMPO sobre todas las causas',
    action:
      'Congelar vocabulario nuevo dos semanas. El problema es protocolo de examen, no estudio.',
    threshold: 40,
    watch: 30,
    unit: 'pct',
    direction: 'above',
    inclusive: false,
    guarded: true,
    read: (m) => (m.totalErrors === 0 ? null : m.despisteTiempoPct),
    sampleSize: (m) => m.totalErrors,
  },
  {
    id: 1,
    signal: 'DESCONOCIMIENTO sobre todas las causas',
    action:
      'El material te queda grande ahora. Baja de nivel o sube el ritmo de Anki antes de más simulacros.',
    threshold: 60,
    watch: 50,
    unit: 'pct',
    direction: 'above',
    inclusive: false,
    guarded: true,
    read: (m) => (m.totalErrors === 0 ? null : m.desconocimientoPct),
    sampleSize: (m) => m.totalErrors,
  },
  {
    id: 2,
    signal: 'Errores con confidence = SEGURO (30 días)',
    action:
      'Las tarjetas de contraste tienen prioridad absoluta. Son creencias falsas, no lagunas.',
    threshold: 5,
    watch: 3,
    unit: 'count',
    direction: 'above',
    // El spec la enuncia "≥ 5", no "> 5": con 5 ya se dispara.
    inclusive: true,
    // Conteo absoluto: se dispara sin la guarda de n.
    guarded: false,
    read: (m) => m.seguroCount,
    sampleSize: (m) => m.seguroCount,
  },
  {
    id: 3,
    signal: 'Una sola categoría sobre el total de errores',
    action: 'Sábados monotemáticos durante tres semanas.',
    threshold: 25,
    watch: 20,
    unit: 'pct',
    direction: 'above',
    inclusive: false,
    guarded: true,
    read: (m) => m.topCategory?.pct ?? null,
    sampleSize: (m) => m.totalErrors,
    detail: (m) => m.topCategory?.category ?? null,
  },
  {
    id: 4,
    signal: 'pct_convertidos (Q5)',
    action:
      'Salta ejercicios un día y ponte al día con las tarjetas. Si no, el log no sirve de nada.',
    threshold: ANKI_TARGET_PCT,
    watch: 90,
    unit: 'pct',
    // Se cruza por abajo: convertir poco es lo malo.
    direction: 'below',
    inclusive: false,
    // Ratio de conversion: se dispara sin la guarda de n.
    guarded: false,
    read: (m) => m.ankiPct,
    sampleSize: (m) => m.totalErrors,
  },
  {
    id: 5,
    signal: 'Errores con late_in_session (solo sesiones cronometradas)',
    action:
      'Fatiga o gestión del tiempo. Practica parts cronometrados sueltos, no sesiones largas.',
    threshold: 35,
    watch: 28,
    unit: 'pct',
    direction: 'above',
    inclusive: false,
    guarded: true,
    read: (m) => m.latePct,
    // Decision P3: el denominador son los errores de sesiones cronometradas.
    sampleSize: (m) => m.timedErrors,
  },
  {
    id: 6,
    signal: 'El rewrite repite errores del original',
    action: 'No estás leyendo la corrección. Léela antes de reescribir, con el original delante.',
    threshold: REWRITE_REPEAT_PCT,
    watch: 35,
    unit: 'pct',
    direction: 'above',
    inclusive: false,
    guarded: true,
    read: (m) => (m.rewritePairs === 0 ? null : m.rewriteRepeatedPct),
    sampleSize: (m) => m.rewriteOriginalErrors,
  },
];

/**
 * Orden de prioridad. La regla 4 manda sobre todo: si el bucle de conversion esta roto,
 * cualquier otro remedio se pierde por el camino.
 */
export const PRIORITY: readonly number[] = [4, 0, 1, 2, 3, 5, 6];

export interface RuleEvaluation {
  readonly id: number;
  readonly signal: string;
  readonly action: string;
  readonly status: RuleStatus;
  readonly value: number | null;
  readonly threshold: number;
  readonly watch: number;
  readonly unit: 'pct' | 'count';
  readonly direction: Direction;
  /** Para poder imprimir el umbral tal y como se compara: `> 40%` frente a `>= 5`. */
  readonly inclusive: boolean;
  readonly sampleSize: number;
  readonly detail: string | null;
}

export interface RulesReport {
  readonly rules: readonly RuleEvaluation[];
  /** La unica accion destacada. `null` si no se dispara ninguna regla. */
  readonly doNow: RuleEvaluation | null;
  readonly queued: readonly RuleEvaluation[];
}

function crosses(
  value: number,
  limit: number,
  direction: Direction,
  inclusive: boolean,
): boolean {
  if (direction === 'above') return inclusive ? value >= limit : value > limit;
  return inclusive ? value <= limit : value < limit;
}

export function evaluateRules(measurements: RuleMeasurements): RulesReport {
  const triggered = new Set<number>();

  const preliminary = RULE_SPECS.map((spec): RuleEvaluation => {
    const value = spec.read(measurements);
    const sampleSize = spec.sampleSize(measurements);
    const detail = spec.detail?.(measurements) ?? null;

    const base = {
      id: spec.id,
      signal: spec.signal,
      action: spec.action,
      value,
      threshold: spec.threshold,
      watch: spec.watch,
      unit: spec.unit,
      direction: spec.direction,
      inclusive: spec.inclusive,
      sampleSize,
      detail,
    };

    // 1. Sin dato del tipo que mide la regla, no hay nada que decir.
    if (value === null) return { ...base, status: 'n/a' };

    // 2. La guarda de n va antes que el umbral: con pocos errores el porcentaje es ruido
    //    y disparar una accion equivocada cuesta una semana de estudio.
    if (spec.guarded && sampleSize < MIN_N) return { ...base, status: NEEDS_N };

    // 3. Umbral.
    if (crosses(value, spec.threshold, spec.direction, spec.inclusive)) {
      triggered.add(spec.id);
      return { ...base, status: 'QUEUED' };
    }

    // 4. Aviso antes de cruzar.
    if (crosses(value, spec.watch, spec.direction, spec.inclusive)) {
      return { ...base, status: 'WATCH' };
    }

    return { ...base, status: 'ok' };
  });

  // De las disparadas, la primera en el orden de prioridad es la unica DO NOW.
  const winner = PRIORITY.find((id) => triggered.has(id));

  const rules = preliminary.map((rule) =>
    rule.id === winner ? { ...rule, status: 'DO NOW' as RuleStatus } : rule,
  );

  return {
    rules,
    doNow: rules.find((rule) => rule.status === 'DO NOW') ?? null,
    queued: rules.filter((rule) => rule.status === 'QUEUED'),
  };
}
