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

// Cargar una extension obliga a abrir ventana, y en CI no hay pantalla donde abrirla.
test.skip(process.env.CI !== undefined, 'necesita navegador con ventana');

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
    headless: false,
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
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });

    const page = await context.newPage();
    await page.goto(PORTAL);
    await page.waitForTimeout(2500);

    const marcos = page.frames().map((frame) => frame.url());
    expect(marcos.some((url) => url.startsWith('blob:')), `marcos: ${marcos.join(' | ')}`).toBe(true);

    for (const frame of page.frames()) {
      const url = frame.url();
      if (url === PORTAL) continue;

      // El panel vive en un shadow root, asi que se busca por su marca en el anfitrion.
      const tienePanel = await frame.evaluate(() => {
        const host = document.querySelector('[data-errorlog-ui]');
        return {
          existe: Boolean(host),
          boton: host?.shadowRoot?.querySelector('.toggle')?.textContent ?? null,
          estado: host?.shadowRoot?.querySelector('.status')?.textContent ?? null,
        };
      });
      expect(tienePanel.existe, `sin panel en ${url}`).toBe(true);
      expect(tienePanel.boton, `boton en ${url}`).toContain('Errores');
      expect(tienePanel.estado, `estado en ${url}`).toContain('fallo');
    }
  } finally {
    await context.close();
  }
});
