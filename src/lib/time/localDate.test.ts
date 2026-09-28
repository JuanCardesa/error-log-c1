import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

// Otro proceso fija TZ antes de cargar Node: también funciona en Windows y no
// depende de la zona horaria de quien ejecuta Vitest.
function inTimezone(tz: string, instant: string) {
  return JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { toIsoDate, windowStart, inWindow, isIsoDate } from './src/lib/time/dates.ts';
    import { sessionInputSchema } from './src/lib/validation/schemas.ts';
    const now = new Date('${instant}');
    const today = toIsoDate(now);
    console.log(JSON.stringify({ today, start30: windowStart(now, 30), start60: windowStart(now, 60),
      includesToday: inWindow('2026-09-20', now, 30),
      valid: sessionInputSchema({ today }).safeParse({ date: '2026-09-20', kind: 'DRILL',
        paper: null, part: null, source: 'LIBRO', itemsTotal: 8, itemsCorrect: 6 }).success,
      leap: isIsoDate('2024-02-29'), invalid: isIsoDate('2026-02-29') }));
  `], { encoding: 'utf8', env: { ...process.env, TZ: tz } }));
}

it('acepta hoy en Madrid a las 00:30 y termina los informes en ese día local', () => {
  expect(inTimezone('Europe/Madrid', '2026-09-19T22:30:00Z')).toMatchObject({
    today: '2026-09-20', start30: '2026-08-22', start60: '2026-07-23',
    includesToday: true, valid: true, leap: true, invalid: false,
  });
});

it('mantiene la aritmética civil al oeste de UTC y al cruzar el cambio de hora', () => {
  expect(inTimezone('America/Los_Angeles', '2026-09-20T01:30:00Z')).toMatchObject({
    today: '2026-09-19', start30: '2026-08-21', leap: true, invalid: false,
  });
  expect(inTimezone('Europe/Madrid', '2026-10-26T00:30:00Z')).toMatchObject({
    today: '2026-10-26', start30: '2026-09-27', start60: '2026-08-28',
  });
});
