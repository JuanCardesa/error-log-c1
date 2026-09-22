import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLLOVER_HOUR, ankiDay, rolloverFrom } from './schedule';

describe('corte de día de Anki', () => {
  it.each([
    ['2026-09-22T01:30:00', 4, '2026-09-21'],
    ['2026-09-22T03:59:00', 4, '2026-09-21'],
    ['2026-09-22T04:00:00', 4, '2026-09-22'],
    ['2026-09-22T23:30:00', 4, '2026-09-22'],
    // Con corte a medianoche coincide con el calendario civil.
    ['2026-09-22T01:30:00', 0, '2026-09-22'],
  ])('%s con corte a las %i cae en %s', (instant, hour, expected) => {
    expect(ankiDay(new Date(instant), hour)).toBe(expected);
  });

  it('lee la hora de configuración esté donde esté', () => {
    expect(rolloverFrom({ scheduling: { rollover: 2 } })).toBe(2);
    expect(rolloverFrom({ sched: { rollover: 5 } })).toBe(5);
    expect(rolloverFrom({ rollover: 0 })).toBe(0);
  });

  it.each([
    ['nulo', null],
    ['no es objeto', 6],
    ['sin la clave', { collapseTime: 1200 }],
    ['fuera de rango', { rollover: 24 }],
    ['negativa', { rollover: -1 }],
    ['no entera', { rollover: 4.5 }],
    ['no numérica', { rollover: '4' }],
  ])('cae al valor documentado cuando la respuesta %s', (_label, preferences) => {
    expect(rolloverFrom(preferences)).toBe(DEFAULT_ROLLOVER_HOUR);
  });
});
