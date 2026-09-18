import { expect, it } from 'vitest';

import { withSessionFormat } from './session';

it('rechaza filas parcialmente nulas al entrar al dominio', () => {
  expect(() => withSessionFormat({ paper: 'RUOE', part: null })).toThrow(/Paper y part/);
  expect(() => withSessionFormat({ paper: null, part: 1 })).toThrow(/Paper y part/);
});
