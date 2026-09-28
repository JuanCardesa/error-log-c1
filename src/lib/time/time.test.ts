import { describe, expect, it } from 'vitest';

import { addDays, inWindow, isIsoDate, parseIsoDate, toUtcIsoDate, windowStart } from './dates';
import { formatIsoWeek, isoWeekOf } from './isoWeek';

describe('fechas civiles', () => {
  it('acepta fechas reales y rechaza las que no existen', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // bisiesto
    expect(isIsoDate('2026-02-29')).toBe(false); // no bisiesto
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('ayer')).toBe(false);
  });

  it('lanza al parsear una cadena sin forma de fecha', () => {
    expect(() => parseIsoDate('ayer')).toThrow(RangeError);
  });

  it('va y vuelve sin desplazarse de dia', () => {
    expect(toUtcIsoDate(parseIsoDate('2026-09-14'))).toBe('2026-09-14');
  });

  it('suma y resta dias cruzando el cambio de mes y de año', () => {
    expect(toUtcIsoDate(addDays(parseIsoDate('2026-01-31'), 1))).toBe('2026-02-01');
    expect(toUtcIsoDate(addDays(parseIsoDate('2026-01-01'), -1))).toBe('2025-12-31');
  });
});

describe('ventana de analisis', () => {
  const now = new Date(2026, 8, 14, 22, 30);

  it('es inclusiva en los dos extremos', () => {
    // 30 dias = hoy mas los 29 anteriores.
    expect(windowStart(now, 30)).toBe('2026-08-16');
    expect(inWindow('2026-08-16', now, 30)).toBe(true);
    expect(inWindow('2026-09-14', now, 30)).toBe(true);
  });

  it('deja fuera el dia anterior al inicio y cualquier fecha futura', () => {
    expect(inWindow('2026-08-15', now, 30)).toBe(false);
    expect(inWindow('2026-09-15', now, 30)).toBe(false);
  });

  it('la ventana de 60 dias contiene a la de 30', () => {
    expect(windowStart(now, 60)).toBe('2026-07-17');
    expect(inWindow('2026-07-17', now, 60)).toBe(true);
    expect(inWindow('2026-08-15', now, 60)).toBe(true);
  });

  it('no depende de la hora del dia', () => {
    const early = new Date(2026, 8, 14, 0, 0, 1);
    const late = new Date(2026, 8, 14, 23, 59, 59);
    expect(windowStart(early, 30)).toBe(windowStart(late, 30));
  });
});

describe('semana ISO 8601', () => {
  it('formatea con dos digitos', () => {
    expect(formatIsoWeek(2026, 7)).toBe('2026-W07');
    expect(formatIsoWeek(2026, 38)).toBe('2026-W38');
  });

  it('resuelve los casos frontera del cambio de año', () => {
    // El 2026-01-01 es jueves: arrastra su semana al año nuevo.
    expect(isoWeekOf('2026-01-01').label).toBe('2026-W01');
    // El 2024-12-30 es lunes de la semana cuyo jueves cae en 2025.
    expect(isoWeekOf('2024-12-30').label).toBe('2025-W01');
    // El 2023-01-01 es domingo: pertenece aun a la ultima semana de 2022.
    expect(isoWeekOf('2023-01-01').label).toBe('2022-W52');
  });

  it('da la misma semana a todos los dias de un mismo lunes-domingo', () => {
    const monday = isoWeekOf('2026-09-14');
    expect(isoWeekOf('2026-09-20').label).toBe(monday.label);
    expect(isoWeekOf('2026-09-21').label).not.toBe(monday.label);
  });

  it('expone año y numero por separado', () => {
    const week = isoWeekOf('2024-12-30');
    expect(week.year).toBe(2025);
    expect(week.week).toBe(1);
  });
});
