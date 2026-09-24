import { expect, test } from '@playwright/test';

/**
 * La app se usa tambien desde el movil. Lo que se comprueba es una propiedad, no un
 * diseño: ninguna pagina obliga a desplazarse en horizontal para leerla.
 *
 * El caso que lo rompia no eran las tablas anchas —esas ya scrollean dentro de su
 * envoltorio— sino un `.sr-only` posicionado en absoluto dentro de una de ellas: sin un
 * bloque contenedor con `position: relative`, se escapaba del scroll y empujaba la pagina.
 */

const ROUTES = ['/registrar', '/errores', '/informe', '/anki', '/anki?tab=repasos', '/ruoe', '/certezas', '/writing', '/exportar'] as const;

test.use({ viewport: { width: 390, height: 844 } });

for (const route of ROUTES) {
  test(`${route} se lee sin desplazamiento horizontal`, async ({ page }) => {
    await page.goto(route);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} desborda ${String(overflow)}px`).toBeLessThanOrEqual(0);
  });
}

test.describe('envoltorios con scroll horizontal', () => {
  for (const route of ['/writing', '/ruoe?w=60'] as const) {
    test(`en ${route} recortan lo que posicionan en absoluto`, async ({ page }) => {
      await page.goto(route);
      const wraps = await page.evaluate(() =>
        [...document.querySelectorAll('div')]
          .filter((el) => getComputedStyle(el).overflowX === 'auto')
          .map((el) => ({
            scrolls: el.scrollWidth > el.clientWidth,
            position: getComputedStyle(el).position,
          })));

      // Hay al menos un envoltorio, y ninguno es `static`: si lo fuera, un `.sr-only`
      // de dentro se saldria del scroll y arrastraria la pagina entera.
      expect(wraps.length).toBeGreaterThan(0);
      expect(wraps.every((wrap) => wrap.position !== 'static')).toBe(true);
      // Y alguno desplaza de verdad: la tabla ancha sigue siendo legible ahi dentro.
      expect(wraps.some((wrap) => wrap.scrolls)).toBe(true);
    });
  }
});
