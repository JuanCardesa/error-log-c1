import { describe, expect, it } from 'vitest';

import { parseWindow } from './window';

describe('ventana desde la URL', () => {
  it('por defecto son 30 dias', () => {
    expect(parseWindow(undefined)).toBe(30);
  });

  it('acepta las dos ventanas admitidas', () => {
    expect(parseWindow('30')).toBe(30);
    expect(parseWindow('60')).toBe(60);
  });

  it('cae al defecto ante cualquier otro valor', () => {
    // Una URL manipulada no debe poder inventar una ventana que no existe.
    expect(parseWindow('90')).toBe(30);
    expect(parseWindow('0')).toBe(30);
    expect(parseWindow('-60')).toBe(30);
    expect(parseWindow('sesenta')).toBe(30);
    expect(parseWindow('')).toBe(30);
  });

  it('ignora un parametro repetido', () => {
    expect(parseWindow(['60', '30'])).toBe(30);
  });
});
