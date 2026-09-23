import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  CAUSES,
  CAUSE_META,
  MAX_PART,
  PAPERS,
  generatesCard,
  partsFor,
} from './enums';
import { FIXED_WINDOW_DAYS, MIN_N, WINDOW_DAYS_OPTIONS } from './thresholds';

describe('taxonomia de causas', () => {
  it('tiene exactamente las seis causas del spec', () => {
    expect(CAUSES).toHaveLength(6);
  });

  it('describe cada causa con lado y remedio', () => {
    for (const cause of CAUSES) {
      const meta = CAUSE_META[cause];
      expect(meta.remedy.length).toBeGreaterThan(0);
      expect(['study', 'exec']).toContain(meta.side);
    }
  });

  it('solo generan tarjeta desconocimiento, confusion y ortografia', () => {
    expect(CAUSES.filter(generatesCard)).toEqual([
      'DESCONOCIMIENTO',
      'CONFUSION',
      'ORTOGRAFIA',
    ]);
    expect(generatesCard('DESPISTE')).toBe(false);
    expect(generatesCard('FORMATO')).toBe(false);
    expect(generatesCard('TIEMPO')).toBe(false);
    expect(generatesCard('CONFUSION')).toBe(true);
  });

  it('el despiste es de ejecucion y no se estudia', () => {
    expect(CAUSE_META.DESPISTE.side).toBe('exec');
    expect(CAUSE_META.TIEMPO.side).toBe('exec');
    expect(CAUSE_META.DESCONOCIMIENTO.side).toBe('study');
  });

  it('toda causa que genera tarjeta es del lado study', () => {
    // Si esto se rompe, el remedio y el lado han dejado de concordar.
    for (const cause of CAUSES) {
      if (generatesCard(cause)) expect(CAUSE_META[cause].side).toBe('study');
    }
  });
});

describe('taxonomia de categorias', () => {
  it('tiene las catorce categorias del spec, sin repetidos', () => {
    expect(CATEGORIES).toHaveLength(14);
    expect(new Set(CATEGORIES).size).toBe(14);
  });
});

describe('partes por paper', () => {
  it('respeta el maximo de cada paper', () => {
    expect(MAX_PART).toEqual({ RUOE: 8, WRITING: 2, LISTENING: 4, SPEAKING: 4 });
  });

  it('enumera las partes desde 1 hasta el maximo', () => {
    expect(partsFor('RUOE')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(partsFor('WRITING')).toEqual([1, 2]);
    expect(partsFor('LISTENING')).toEqual([1, 2, 3, 4]);
  });

  it('define un maximo para todos los papers', () => {
    for (const paper of PAPERS) {
      expect(MAX_PART[paper]).toBeGreaterThan(0);
      expect(partsFor(paper)).toHaveLength(MAX_PART[paper]);
    }
  });
});

describe('umbrales', () => {
  it('fija el n minimo en 15', () => {
    expect(MIN_N).toBe(15);
  });

  it('solo admite ventanas de 30 y 60 dias', () => {
    expect([...WINDOW_DAYS_OPTIONS]).toEqual([30, 60]);
  });

  it('la ventana fija de Q4 y la regla 2 es de 30 dias', () => {
    expect(FIXED_WINDOW_DAYS).toBe(30);
  });
});
