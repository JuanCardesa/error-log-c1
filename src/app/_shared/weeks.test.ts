import { describe, expect, it } from 'vitest';

import { getMessages } from '@/lib/i18n';
import { dateRange, decimal, longDate, percent, sessionTitle, shortDate } from './format';
import { windowWeeks } from './weeks';

const es = getMessages('es');
const en = getMessages('en');

describe('semanas de la ventana', () => {
  it('cubre la ventana sin huecos y marca las semanas cortadas por los bordes', () => {
    // Jueves 24 de septiembre de 2026; 30 días empiezan el martes 26 de agosto.
    const weeks = windowWeeks(new Date(2026, 8, 24, 12), 30, es);
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
    expect(shortDate('2026-09-24', es)).toBe('24 sep');
    expect(longDate('2026-09-24', es)).toBe('jueves 24 sep 2026');
    expect(dateRange('2026-08-31', '2026-09-06', es)).toBe('31 ago – 6 sep');
    expect(decimal(5.71, es)).toBe('5,71');
  });

  it('en inglés, con nombres y separadores ingleses', () => {
    expect(shortDate('2026-09-24', en)).toBe('24 Sep');
    expect(longDate('2026-09-24', en)).toBe('Thursday 24 Sep 2026');
    expect(dateRange('2026-08-31', '2026-09-06', en)).toBe('31 Aug – 6 Sep');
    expect(decimal(5.71, en)).toBe('5.71');
    expect(percent(87.5, en)).toBe('87.5%');
    expect(percent(87.5, es)).toBe('87,5 %');
  });

  it('titula una sesion por su referencia o, sin ella, por practica y fecha', () => {
    const base = { paper: 'RUOE', part: 3, date: '2026-09-24' } as const;
    expect(sessionTitle({ ...base, sourceRef: 'Unidad 4' }, es)).toBe('Unidad 4');
    // La referencia es del usuario: no se traduce.
    expect(sessionTitle({ ...base, sourceRef: 'Unidad 4' }, en)).toBe('Unidad 4');
    expect(sessionTitle({ ...base, sourceRef: '  ' }, es)).toBe('RUOE · Part 3 · 24 sep');
    expect(sessionTitle({ paper: null, part: null, date: '2026-09-24', sourceRef: null }, es)).toBe('Sin formato de examen · 24 sep');
    expect(sessionTitle({ paper: null, part: null, date: '2026-09-24', sourceRef: null }, en)).toBe('No exam format · 24 Sep');
  });
});
