import { describe, expect, it } from 'vitest';

import { describe as message } from '../src/core/report.js';

describe('mensajes de estado', () => {
  it('«no hay errores» no se parece a «no he podido leerlo»', () => {
    const clean = message({ phase: 'ready', incorrect: 0, correct: 8, checked: 8 });
    const broken = message({ phase: 'unsupported' });

    expect(clean.tone).toBe('good');
    expect(clean.canExport).toBe(false);
    expect(clean.title).toMatch(/todo correcto/i);

    expect(broken.tone).toBe('problem');
    expect(broken.canExport).toBe(false);
    expect(broken.title).not.toMatch(/todo correcto/i);
  });

  it('sin corregir no ofrece exportar', () => {
    const state = message({ phase: 'uncorrected' });
    expect(state.canExport).toBe(false);
    expect(state.detail).toMatch(/corregir/i);
  });

  it('a medio corregir avisa de que no exporta para no dejarse fallos', () => {
    const state = message({ phase: 'partial' });
    expect(state.canExport).toBe(false);
    expect(state.tone).toBe('problem');
  });

  it('con fallos nuevos dice cuantos ha guardado de esta actividad', () => {
    const state = message({ phase: 'ready', incorrect: 3, checked: 10, fresh: 3 });
    expect(state.title).toMatch(/3 fallos guardados/);
    expect(state.detail).toMatch(/Copiar todo/);
  });

  it('si ya estaban en la bandeja, no los vuelve a anunciar como nuevos', () => {
    const state = message({ phase: 'ready', incorrect: 3, checked: 10, fresh: 0 });
    expect(state.title).toMatch(/ya estaban guardados/i);
  });

  it('avisa de los formatos que todavia no se leen', () => {
    const state = message({ phase: 'unreadable' });
    expect(state.canExport).toBe(false);
    expect(state.detail).toMatch(/arrastrar/i);
  });

  it('una fase desconocida nunca habilita la exportacion', () => {
    expect(message({ phase: 'vaya' }).canExport).toBe(false);
  });
});
