import { describe, expect, it } from 'vitest';

import { MIN_N } from '../domain/thresholds';
import type { RuleMeasurements } from './measurements';
import {
  NEEDS_N,
  PRIORITY,
  RULE_SPECS,
  type RuleStatus,
  evaluateRules,
} from './rules';

/** Medidas en las que ninguna regla se dispara ni avisa. Cada test mueve solo la suya. */
function baseline(overrides: Partial<RuleMeasurements> = {}): RuleMeasurements {
  return {
    totalErrors: 20,
    despisteTiempoPct: 10,
    desconocimientoPct: 10,
    seguroCount: 0,
    topCategory: { category: 'LEXICO', pct: 10 },
    ankiPct: 100,
    timedErrors: 20,
    latePct: 10,
    rewritePairs: 1,
    rewriteOriginalErrors: 20,
    rewriteRepeatedPct: 10,
    ...overrides,
  };
}

function statusOf(id: number, overrides: Partial<RuleMeasurements>): RuleStatus {
  const report = evaluateRules(baseline(overrides));
  const rule = report.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`No existe la regla ${String(id)}`);
  return rule.status;
}

describe('estado de reposo', () => {
  it('no destaca nada cuando todo esta en orden', () => {
    const report = evaluateRules(baseline());
    expect(report.doNow).toBeNull();
    expect(report.queued).toEqual([]);
    expect(report.rules.every((rule) => rule.status === 'ok')).toBe(true);
  });

  it('evalua las siete reglas', () => {
    expect(evaluateRules(baseline()).rules).toHaveLength(7);
    expect(RULE_SPECS.map((spec) => spec.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('regla 0 · despiste y tiempo', () => {
  it('ok por debajo del aviso', () => {
    expect(statusOf(0, { despisteTiempoPct: 29 })).toBe('ok');
  });
  it('avisa entre el 30 y el 40', () => {
    expect(statusOf(0, { despisteTiempoPct: 31 })).toBe('WATCH');
    expect(statusOf(0, { despisteTiempoPct: 40 })).toBe('WATCH');
  });
  it('se dispara por encima del 40', () => {
    expect(statusOf(0, { despisteTiempoPct: 41 })).toBe('DO NOW');
  });
  it('no se dispara justo en el umbral', () => {
    expect(statusOf(0, { despisteTiempoPct: 40 })).not.toBe('DO NOW');
  });
  it('queda en espera de n con pocos errores', () => {
    expect(statusOf(0, { despisteTiempoPct: 90, totalErrors: MIN_N - 1 })).toBe(NEEDS_N);
  });
  it('no aplica sin errores', () => {
    expect(statusOf(0, { totalErrors: 0 })).toBe('n/a');
  });
});

describe('regla 1 · desconocimiento', () => {
  it('ok por debajo del aviso', () => {
    expect(statusOf(1, { desconocimientoPct: 49 })).toBe('ok');
  });
  it('avisa entre el 50 y el 60', () => {
    expect(statusOf(1, { desconocimientoPct: 55 })).toBe('WATCH');
  });
  it('se dispara por encima del 60', () => {
    expect(statusOf(1, { desconocimientoPct: 61 })).toBe('DO NOW');
  });
  it('queda en espera de n con pocos errores', () => {
    expect(statusOf(1, { desconocimientoPct: 90, totalErrors: 14 })).toBe(NEEDS_N);
  });
  it('no aplica sin errores', () => {
    expect(statusOf(1, { totalErrors: 0 })).toBe('n/a');
  });
});

describe('regla 2 · falsas certezas', () => {
  it('ok por debajo de tres', () => {
    expect(statusOf(2, { seguroCount: 2 })).toBe('ok');
  });
  it('avisa a partir de tres', () => {
    expect(statusOf(2, { seguroCount: 3 })).toBe('WATCH');
    expect(statusOf(2, { seguroCount: 4 })).toBe('WATCH');
  });
  it('se dispara en cinco, porque el umbral es "≥ 5"', () => {
    expect(statusOf(2, { seguroCount: 5 })).toBe('DO NOW');
  });
  it('se dispara sin la guarda de n, por ser conteo absoluto', () => {
    // Cinco creencias falsas son cinco creencias falsas, haya 6 errores o 600.
    expect(statusOf(2, { seguroCount: 5, totalErrors: 6 })).toBe('DO NOW');
  });
});

describe('regla 3 · categoria dominante', () => {
  it('ok por debajo del aviso', () => {
    expect(statusOf(3, { topCategory: { category: 'LEXICO', pct: 19 } })).toBe('ok');
  });
  it('avisa entre el 20 y el 25', () => {
    expect(statusOf(3, { topCategory: { category: 'LEXICO', pct: 22 } })).toBe('WATCH');
  });
  it('se dispara por encima del 25', () => {
    expect(statusOf(3, { topCategory: { category: 'SPELLING', pct: 30 } })).toBe('DO NOW');
  });
  it('dice cual es la categoria', () => {
    const report = evaluateRules(
      baseline({ topCategory: { category: 'SPELLING', pct: 30 } }),
    );
    expect(report.doNow?.detail).toBe('SPELLING');
  });
  it('queda en espera de n con pocos errores', () => {
    expect(
      statusOf(3, { topCategory: { category: 'SPELLING', pct: 90 }, totalErrors: 14 }),
    ).toBe(NEEDS_N);
  });
  it('no aplica sin categorias', () => {
    expect(statusOf(3, { topCategory: null })).toBe('n/a');
  });
});

describe('regla 4 · deuda de Anki', () => {
  it('ok en el 90 o por encima', () => {
    expect(statusOf(4, { ankiPct: 90 })).toBe('ok');
    expect(statusOf(4, { ankiPct: 100 })).toBe('ok');
  });
  it('avisa entre el 80 y el 90', () => {
    expect(statusOf(4, { ankiPct: 85 })).toBe('WATCH');
    expect(statusOf(4, { ankiPct: 80 })).toBe('WATCH');
  });
  it('se dispara por debajo del 80', () => {
    expect(statusOf(4, { ankiPct: 79 })).toBe('DO NOW');
  });
  it('se dispara sin la guarda de n, por ser un ratio de conversion', () => {
    expect(statusOf(4, { ankiPct: 50, totalErrors: 3 })).toBe('DO NOW');
  });
  it('no aplica si no hay nada que convertir', () => {
    // Una base vacia no tiene una deuda del 100%: no tiene deuda.
    expect(statusOf(4, { ankiPct: null })).toBe('n/a');
  });
});

describe('regla 5 · fatiga al final de la sesion', () => {
  it('ok por debajo del aviso', () => {
    expect(statusOf(5, { latePct: 27 })).toBe('ok');
  });
  it('avisa entre el 28 y el 35', () => {
    expect(statusOf(5, { latePct: 30 })).toBe('WATCH');
  });
  it('se dispara por encima del 35', () => {
    expect(statusOf(5, { latePct: 40 })).toBe('DO NOW');
  });
  it('mide la guarda de n sobre los errores cronometrados, no sobre el total', () => {
    // Muchos errores en total, pero pocos con cronometro: el dato no da para decidir.
    expect(statusOf(5, { latePct: 90, totalErrors: 100, timedErrors: 14 })).toBe(NEEDS_N);
  });
  it('no aplica sin sesiones cronometradas', () => {
    expect(statusOf(5, { latePct: null, timedErrors: 0 })).toBe('n/a');
  });
});

describe('regla 6 · eficacia del rewrite', () => {
  it('ok por debajo del aviso', () => {
    expect(statusOf(6, { rewriteRepeatedPct: 30 })).toBe('ok');
  });
  it('avisa entre el 35 y el 50', () => {
    expect(statusOf(6, { rewriteRepeatedPct: 40 })).toBe('WATCH');
  });
  it('se dispara por encima del 50', () => {
    expect(statusOf(6, { rewriteRepeatedPct: 60 })).toBe('DO NOW');
  });
  it('queda en espera de n con pocos errores en el original', () => {
    expect(statusOf(6, { rewriteRepeatedPct: 90, rewriteOriginalErrors: 14 })).toBe(
      NEEDS_N,
    );
  });
  it('no aplica si no hay ningun par original/rewrite', () => {
    expect(statusOf(6, { rewritePairs: 0 })).toBe('n/a');
  });
});

describe('la guarda de n', () => {
  it('protege a las cinco reglas de porcentaje', () => {
    const guarded = RULE_SPECS.filter((spec) => spec.guarded).map((spec) => spec.id);
    expect(guarded).toEqual([0, 1, 3, 5, 6]);
  });

  it('deja fuera a las dos que no son porcentajes de la ventana', () => {
    const unguarded = RULE_SPECS.filter((spec) => !spec.guarded).map((spec) => spec.id);
    expect(unguarded).toEqual([2, 4]);
  });

  it('ninguna regla guardada se dispara por debajo de MIN_N', () => {
    // Todas las señales al maximo, pero sin muestra suficiente.
    const report = evaluateRules(
      baseline({
        totalErrors: MIN_N - 1,
        despisteTiempoPct: 100,
        desconocimientoPct: 100,
        topCategory: { category: 'SPELLING', pct: 100 },
        timedErrors: MIN_N - 1,
        latePct: 100,
        rewriteOriginalErrors: MIN_N - 1,
        rewriteRepeatedPct: 100,
      }),
    );

    for (const rule of report.rules) {
      const spec = RULE_SPECS.find((candidate) => candidate.id === rule.id);
      if (spec?.guarded === true) expect(rule.status).toBe(NEEDS_N);
    }
  });

  it('se dispara justo al alcanzar MIN_N', () => {
    expect(statusOf(0, { despisteTiempoPct: 90, totalErrors: MIN_N })).toBe('DO NOW');
  });
});

describe('prioridad', () => {
  it('ordena segun [4, 0, 1, 2, 3, 5, 6]', () => {
    expect(PRIORITY).toEqual([4, 0, 1, 2, 3, 5, 6]);
  });

  it('con tres reglas disparadas solo una queda como DO NOW', () => {
    // Se disparan la 0, la 3 y la 5.
    const report = evaluateRules(
      baseline({
        despisteTiempoPct: 45,
        topCategory: { category: 'SPELLING', pct: 30 },
        latePct: 40,
      }),
    );

    expect(report.doNow?.id).toBe(0);
    expect(report.queued.map((rule) => rule.id)).toEqual([3, 5]);
    expect(report.rules.filter((rule) => rule.status === 'DO NOW')).toHaveLength(1);
  });

  it('la regla 4 manda sobre cualquier otra', () => {
    const report = evaluateRules(
      baseline({
        ankiPct: 50,
        despisteTiempoPct: 99,
        desconocimientoPct: 99,
        seguroCount: 40,
        topCategory: { category: 'SPELLING', pct: 99 },
        latePct: 99,
        rewriteRepeatedPct: 99,
      }),
    );

    expect(report.doNow?.id).toBe(4);
    expect(report.queued.map((rule) => rule.id)).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it('cede el DO NOW a la siguiente en orden cuando la 4 no se dispara', () => {
    const report = evaluateRules(
      baseline({ desconocimientoPct: 70, latePct: 40 }),
    );
    expect(report.doNow?.id).toBe(1);
    expect(report.queued.map((rule) => rule.id)).toEqual([5]);
  });

  it('nunca hay dos DO NOW, se dispare lo que se dispare', () => {
    // Propiedad, no un ejemplo: las 128 combinaciones de reglas disparadas.
    const signals = [
      { despisteTiempoPct: 99 },
      { desconocimientoPct: 99 },
      { seguroCount: 40 },
      { topCategory: { category: 'SPELLING' as const, pct: 99 } },
      { ankiPct: 10 },
      { latePct: 99 },
      { rewriteRepeatedPct: 99 },
    ];

    for (let mask = 0; mask < 1 << signals.length; mask += 1) {
      let overrides: Partial<RuleMeasurements> = {};
      const expected: number[] = [];

      signals.forEach((signal, index) => {
        if ((mask & (1 << index)) !== 0) {
          overrides = { ...overrides, ...signal };
          expected.push(index === 4 ? 4 : index === 5 ? 5 : index === 6 ? 6 : index);
        }
      });

      const report = evaluateRules(baseline(overrides));
      const doNowCount = report.rules.filter((rule) => rule.status === 'DO NOW').length;

      expect(doNowCount).toBeLessThanOrEqual(1);
      if (expected.length > 0) {
        expect(doNowCount).toBe(1);
        // Y es siempre la primera de las disparadas en el orden de prioridad.
        const winner = PRIORITY.find((id) => expected.includes(id));
        expect(report.doNow?.id).toBe(winner);
      } else {
        expect(report.doNow).toBeNull();
      }
    }
  });
});
