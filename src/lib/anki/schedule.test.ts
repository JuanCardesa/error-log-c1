import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLLOVER_HOUR, ankiDay, isRolloverHour, resolveRollover } from './schedule';

// Otro proceso fija TZ antes de cargar Node: tambien funciona en Windows y no depende
// de la zona horaria de quien ejecuta Vitest.
function ankiDayIn(tz: string, localInstant: string, rolloverHour: number): string {
  return execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { ankiDay } from './src/lib/anki/schedule.ts';
    process.stdout.write(ankiDay(new Date('${localInstant}'), ${String(rolloverHour)}));
  `], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
}

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

  it.each([
    // Adelanto: 02:00 -> 03:00. A las 04:30 el reloj ya pasó el corte, asi que es su dia.
    ['2026-03-29T04:30:00', 4, '2026-03-29'],
    // Atraso: 03:00 -> 02:00. A las 03:30 el reloj aun no llegó al corte: dia anterior.
    ['2026-10-25T03:30:00', 4, '2026-10-24'],
  ])('en Madrid, %s con corte a las %i cae en %s aunque cambie la hora', (instant, hour, expected) => {
    // Restar la duracion del corte al instante absoluto daba aqui un dia de diferencia.
    expect(ankiDayIn('Europe/Madrid', instant, hour)).toBe(expected);
  });

  it.each([
    ['entera dentro de rango', 0, true],
    ['entera dentro de rango', 23, true],
    ['fuera de rango', 24, false],
    ['negativa', -1, false],
    ['no entera', 4.5, false],
    ['no numérica', '4', false],
    ['nula', null, false],
  ])('acepta o rechaza la hora declarada: %s (%j)', (_label, value, expected) => {
    expect(isRolloverHour(value)).toBe(expected);
  });

  it('distingue lo declarado de lo supuesto', () => {
    // AnkiConnect no expone el corte de la colección, asi que solo hay dos origenes.
    expect(resolveRollover(6)).toEqual({ hour: 6, source: 'config' });
    expect(resolveRollover(0)).toEqual({ hour: 0, source: 'config' });
    expect(resolveRollover()).toEqual({ hour: DEFAULT_ROLLOVER_HOUR, source: 'default' });
  });
});
