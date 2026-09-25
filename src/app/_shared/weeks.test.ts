import { describe, expect, it } from 'vitest';

import { dateRange, decimal, longDate, sessionTitle, shortDate } from './format';
import { windowWeeks } from './weeks';

describe('semanas de la ventana', () => {
  it('cubre la ventana sin huecos y marca las semanas cortadas por los bordes', () => {
    // Jueves 24 de septiembre de 2026; 30 días empiezan el martes 26 de agosto.
    const weeks = windowWeeks(new Date(2026, 8, 24, 12), 30);
    expect(weeks[0]).toMatchObject({ start: '2026-08-26', end: '2026-08-30', partial: true, iso: '2026-W35' });
    expect(weeks.at(-1)).toMatchObject({ start: '2026-09-21', end: '2026-09-24', partial: true, iso: '2026-W39' });
    expect(weeks.filter((week) => !week.partial).map((week) => week.range)).toEqual(['31 ago – 6 sep', '7 – 13 sep', '14 – 20 sep']);
    for (let i = 1; i < weeks.length; i += 1) {
      expect((weeks[i]?.start ?? '') > (weeks[i - 1]?.end ?? '')).toBe(true);
    }
  });
});

describe('formato legible', () => {
  it('fechas cortas, largas e intervalos', () => {
    expect(shortDate('2026-09-24')).toBe('24 sep');
    expect(longDate('2026-09-24')).toBe('jueves 24 sep 2026');
    expect(dateRange('2026-08-31', '2026-09-06')).toBe('31 ago – 6 sep');
    expect(decimal(5.71)).toBe('5,71');
  });

  it('titula una sesion por su referencia o, sin ella, por practica y fecha', () => {
    const base = { paper: 'RUOE', part: 3, date: '2026-09-24' } as const;
    expect(sessionTitle({ ...base, sourceRef: 'Unidad 4' })).toBe('Unidad 4');
    expect(sessionTitle({ ...base, sourceRef: '  ' })).toBe('RUOE · Part 3 · 24 sep');
    expect(sessionTitle({ paper: null, part: null, date: '2026-09-24', sourceRef: null })).toBe('Sin formato de examen · 24 sep');
  });
});
