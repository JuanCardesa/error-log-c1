import { beforeEach, describe, expect, it } from 'vitest';

import type { QueryOptions } from '../domain/types';
import {
  NOW,
  daysAgo,
  makeDataset,
  makeError,
  makeErrors,
  makePiece,
  makeSession,
  resetIds,
} from '../queries/fixtures/build';
import { runRules } from './index';
import { measure } from './measurements';

const opts: QueryOptions = { now: NOW, windowDays: 30 };

beforeEach(() => {
  resetIds();
});

describe('medicion sobre datos reales', () => {
  it('cuenta despiste y tiempo juntos, pero no el resto del lado exec', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [
        makeError({ sessionId: 1, cause: 'DESPISTE' }),
        makeError({ sessionId: 1, cause: 'TIEMPO' }),
        // FORMATO tambien es `exec`, pero la regla 0 no lo cuenta.
        makeError({ sessionId: 1, cause: 'FORMATO' }),
        makeError({ sessionId: 1, cause: 'DESCONOCIMIENTO' }),
      ],
    });

    const m = measure(data, opts);
    expect(m.totalErrors).toBe(4);
    expect(m.despisteTiempoPct).toBe(50);
    expect(m.desconocimientoPct).toBe(25);
  });

  it('elige la categoria mas repetida y su peso', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1 })],
      errors: [
        ...makeErrors(3, { sessionId: 1, category: 'SPELLING' }),
        makeError({ sessionId: 1, category: 'LEXICO' }),
      ],
    });

    expect(measure(data, opts).topCategory).toEqual({ category: 'SPELLING', pct: 75 });
  });

  it('restringe el denominador de la fatiga a sesiones cronometradas', () => {
    const data = makeDataset({
      sessions: [
        makeSession({ id: 1, timed: true }),
        makeSession({ id: 2, timed: false }),
      ],
      errors: [
        makeError({ sessionId: 1, lateInSession: true }),
        makeError({ sessionId: 1, lateInSession: false }),
        // Seis errores sin cronometro: no deben diluir el porcentaje.
        ...makeErrors(6, { sessionId: 2, lateInSession: false }),
      ],
    });

    const m = measure(data, opts);
    expect(m.timedErrors).toBe(2);
    expect(m.latePct).toBe(50);
  });

  it('deja la fatiga sin medir si no hubo cronometro', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, timed: false })],
      errors: [makeError({ sessionId: 1, lateInSession: true })],
    });

    const m = measure(data, opts);
    expect(m.timedErrors).toBe(0);
    expect(m.latePct).toBeNull();
  });

  it('mide las falsas certezas en 30 dias aunque la ventana sea de 60', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, date: daysAgo(45) })],
      errors: [makeError({ sessionId: 1, confidence: 'SEGURO' })],
    });

    expect(measure(data, { now: NOW, windowDays: 60 }).seguroCount).toBe(0);
  });

  it('sobre un dataset vacio no inventa cifras', () => {
    const m = measure(makeDataset(), opts);
    expect(m.totalErrors).toBe(0);
    expect(m.topCategory).toBeNull();
    expect(m.ankiPct).toBeNull();
    expect(m.latePct).toBeNull();
    expect(m.rewriteRepeatedPct).toBeNull();
  });
});

describe('informe completo', () => {
  it('una base vacia no destaca ninguna accion', () => {
    const report = runRules(makeDataset(), opts);
    expect(report.doNow).toBeNull();
    expect(report.queued).toEqual([]);

    // Las seis reglas que necesitan un denominador no aplican...
    const notApplicable = report.rules.filter((rule) => rule.status === 'n/a');
    expect(notApplicable.map((rule) => rule.id)).toEqual([0, 1, 3, 4, 5, 6]);

    // ...y la 2 si puede responder: cero falsas certezas es cero, no "no se sabe".
    const rule2 = report.rules.find((rule) => rule.id === 2);
    expect(rule2?.status).toBe('ok');
    expect(rule2?.value).toBe(0);
  });

  it('un log con deuda de Anki destaca la regla 4 por encima del resto', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, itemsTotal: 40, itemsCorrect: 20 })],
      errors: [
        // 20 errores: por encima de MIN_N. Ninguno convertido a tarjeta.
        ...makeErrors(20, {
          sessionId: 1,
          cause: 'DESCONOCIMIENTO',
          category: 'SPELLING',
          ankiAdded: false,
        }),
      ],
    });

    const report = runRules(data, opts);
    expect(report.doNow?.id).toBe(4);
    // La 1 y la 3 tambien se disparan, pero quedan en cola.
    expect(report.queued.map((rule) => rule.id)).toContain(1);
    expect(report.queued.map((rule) => rule.id)).toContain(3);
  });

  it('con pocos errores no dispara nada aunque las señales esten al maximo', () => {
    const data = makeDataset({
      sessions: [makeSession({ id: 1, itemsTotal: 10, itemsCorrect: 0 })],
      errors: makeErrors(10, {
        sessionId: 1,
        cause: 'DESPISTE',
        category: 'SPELLING',
      }),
    });

    const report = runRules(data, opts);
    // 100% de despistes y 100% de una sola categoria, pero n = 10 < 15.
    const rule0 = report.rules.find((rule) => rule.id === 0);
    const rule3 = report.rules.find((rule) => rule.id === 3);
    expect(rule0?.status).toBe('needs n ≥ 15');
    expect(rule3?.status).toBe('needs n ≥ 15');
    expect(report.doNow).toBeNull();
  });

  it('mide la eficacia del rewrite de punta a punta', () => {
    const writingSession = (id: number, days: number) =>
      makeSession({
        id,
        kind: 'WRITING',
        paper: 'WRITING',
        part: 1,
        date: daysAgo(days),
        itemsTotal: null,
        itemsCorrect: null,
      });

    const data = makeDataset({
      sessions: [writingSession(1, 20), writingSession(2, 5)],
      pieces: [
        makePiece({ id: 100, sessionId: 1, rewriteOf: null }),
        makePiece({ id: 101, sessionId: 2, rewriteOf: 100 }),
      ],
      errors: [
        ...makeErrors(16, {
          sessionId: 1,
          category: 'DISCURSO',
          correctAnswer: 'however',
        }),
        makeError({ sessionId: 2, category: 'DISCURSO', correctAnswer: 'however' }),
      ],
    });

    const m = measure(data, opts);
    expect(m.rewritePairs).toBe(1);
    expect(m.rewriteOriginalErrors).toBe(16);
    // Los 16 comparten clave, asi que todos "reaparecen".
    expect(m.rewriteRepeatedPct).toBe(100);

    const rule6 = runRules(data, opts).rules.find((rule) => rule.id === 6);
    expect(rule6?.status).not.toBe('needs n ≥ 15');
  });
});
