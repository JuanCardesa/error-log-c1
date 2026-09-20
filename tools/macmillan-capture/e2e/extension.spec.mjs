import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

import { rcfActivityPage } from './rcf-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const EXTENSION = join(here, '../extension');

/**
 * Esta suite prueba la EXTENSION, no el userscript.
 *
 * El motivo de que exista: un userscript solo entra donde llega `@match`, que no cubre
 * los marcos `blob:`. Macmillan sirve paginas del libro en marcos `blob:`, asi que hay
 * sitios del reproductor donde un gestor de userscripts no llega y no avisa. Aqui se
 * comprueba que la extension si llega, cargandola de verdad en el navegador.
 */
const PORTAL = 'https://mee.macmillaneducation.com/bookviewer/unidad-3';

/** Pagina contenedora con la actividad en un iframe normal y en otro `blob:`. */
function paginaConMarcos() {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Visor</title></head>
<body>
<h1>Visor del libro</h1>
<iframe id="normal" src="/rcf-player.html" width="800" height="400"></iframe>
<iframe id="desdeBlob" width="800" height="400"></iframe>
<script>
  // Igual que hace Macmillan con las paginas del libro: se trae el contenido y se sirve
  // desde un blob, que hereda el origen pero no tiene una URL que un @match pueda casar.
  fetch('/rcf-player.html')
    .then((respuesta) => respuesta.text())
    .then((html) => {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      document.getElementById('desdeBlob').src = url;
    });
</script>
</body></html>`;
}

test('la extension entra en el iframe del reproductor y tambien en uno servido desde blob', async () => {
  const actividad = rcfActivityPage({ activityId: 'act000000000000000000000000ext' });
  const context = await chromium.launchPersistentContext('', {
    // El canal chromium admite extensiones sin ventana, tambien en CI.
    // https://playwright.dev/docs/chrome-extensions
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
    ],
  });

  try {
    await context.route('https://mee.macmillaneducation.com/**', (route) => {
      const body = route.request().url().includes('rcf-player.html')
        ? actividad
        : paginaConMarcos();
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });

    const page = await context.newPage();
    await page.goto(PORTAL);
    await expect(page.locator('#desdeBlob')).toHaveAttribute('src', /^blob:/);

    for (const selector of ['#normal', '#desdeBlob']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      // Los locators esperan la inyeccion y atraviesan el shadow root del panel.
      const panel = page.frameLocator(selector).locator('[data-errorlog-ui]');
      await expect(panel.locator('.toggle'), `sin boton en ${selector}`).toBeVisible();
      await expect(panel.locator('.toggle')).toContainText('Errores');
      await panel.locator('.toggle').click();
      await expect(panel.locator('.status')).toBeVisible();
      await expect(panel.locator('.status')).toContainText('fallo');
    }
  } finally {
    await context.close();
  }
});
