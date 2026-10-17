import { expect, test } from '@playwright/test';

/**
 * Progreso y las vistas de detalle. La propiedad que da sentido al motor: se destaca
 * **una sola** recomendación, con la cifra que la justifica.
 */

test.describe('progreso', () => {
  test('Notebook cabe entero en la cabecera móvil', async ({ page }) => {
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/notebook');
      const link = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Notebook' });
      await expect(link).toBeVisible();
      const metrics = await link.evaluate((element) => ({
        textFits: element.scrollWidth <= element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(metrics.textFits, `Notebook recortado a ${String(width)} px`).toBe(true);
      expect(metrics.pageOverflow, `desbordamiento a ${String(width)} px`).toBeLessThanOrEqual(0);
    }
  });

  test('G N abre Notebook desde otra sección y en Sesiones no abre Nueva sesión', async ({ page }) => {
    const notebook = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Notebook' });
    for (const path of ['/informe', '/registrar']) {
      await page.goto(path);
      // Abrir y cerrar el diálogo exige que los manejadores cliente ya estén hidratados.
      await page.getByRole('button', { name: /^Buscar \(/ }).click();
      await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
      await page.keyboard.press('Escape');
      await notebook.focus();
      await page.keyboard.press('g');
      await page.keyboard.press('n');
      await expect(page).toHaveURL(/\/notebook$/);
      await expect(notebook).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toHaveCount(0);
    }
  });

  test('destaca exactamente una recomendación', async ({ page }) => {
    await page.goto('/informe');
    await expect(page.getByText('Recomendación principal · esta semana')).toBeVisible();

    // La tabla es el respaldo, no la portada: se abre para comprobarla.
    await page.getByText('Ver las siete reglas y sus umbrales').click();
    const rules = page.getByRole('table', { name: /siete reglas/ });
    await expect(rules.locator('tbody tr')).toHaveCount(7);
    const statuses = await rules.locator('tbody tr td:nth-child(2)').allInnerTexts();
    expect(statuses.filter((status) => status.trim() === 'Prioritaria')).toHaveLength(1);
  });

  test('explica por qué se dispara la recomendación, con su muestra', async ({ page }) => {
    await page.goto('/informe');
    await page.getByText('Por qué esta recomendación').click();
    const why = page.locator('details').filter({ hasText: 'Por qué esta recomendación' });
    await expect(why).toContainText('umbral');
    await expect(why).toContainText('muestra de');
    // La cobertura dice qué universo usa cada cifra.
    await expect(page.getByText(/ítems contabilizados \(excluye Writing\)/)).toBeVisible();
  });

  test('la navegación lleva a cada sección y marca dónde estás', async ({ page }) => {
    await page.goto('/informe');
    const nav = page.getByRole('navigation', { name: 'Secciones' });
    for (const name of ['Sesiones', 'Errores', 'Progreso', 'Anki', 'Notebook', 'Writing']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Progreso', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Anki', exact: true })).not.toHaveAttribute('aria-current', 'page');

    // Exportar y el idioma, a un clic en «Más».
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('group', { name: 'Idioma' }).getByRole('menuitemradio')).toHaveCount(2);
    await expect(page.getByRole('menuitem', { name: 'Writing' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Exportar datos' }).click();
    await expect(page).toHaveURL(/\/exportar/);

    // RUOE y Falsas certezas, como pestañas de su sección.
    await page.goto('/informe');
    await page.getByRole('link', { name: 'Reading & Use of English' }).click();
    await expect(page).toHaveURL(/\/ruoe/);
    await page.goto('/errores');
    await page.getByRole('link', { name: 'Falsas certezas' }).click();
    await expect(page).toHaveURL(/\/certezas/);
  });

  test('la ventana de 60 dias cambia el encuadre y se mantiene en la URL', async ({ page }) => {
    await page.goto('/informe');
    await page.getByRole('link', { name: '60 días' }).click();
    await expect(page).toHaveURL(/w=60/);
    await expect(page.getByRole('link', { name: '60 días' })).toHaveAttribute('aria-current', 'true');
    // La pestaña hermana conserva el periodo.
    await expect(page.getByRole('link', { name: 'Reading & Use of English' })).toHaveAttribute('href', '/ruoe?w=60');
  });

  test('RUOE distingue una celda sin datos de un cero y explica la celda elegida', async ({ page }) => {
    await page.goto('/ruoe?w=60');
    // «Sin práctica» es texto para lector de pantalla: una celda vacía no es un 0 %.
    await expect(page.getByText('Sin práctica').first()).toBeAttached();
    const cell = page.getByRole('button', { name: /^Part \d+,/ }).first();
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('complementary', { name: 'Detalle de la celda' })).toContainText('aciertos en');
  });

  test('RUOE se abre con una celda elegida, con columnas iguales y las parts sin práctica nombradas', async ({ page }) => {
    await page.goto('/ruoe?w=60');
    // El panel nunca está vacío: arranca con la part más floja de la última semana.
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
    const detail = page.getByRole('complementary', { name: 'Detalle de la celda' });
    await expect(detail).toContainText('La part más floja de la última semana');
    await expect(detail).toContainText('aciertos en');

    const widths = await page.locator('thead th').evaluateAll((cells) =>
      cells.slice(1).map((cell) => cell.getBoundingClientRect().width));
    // Hasta 1 px por el reparto de subpíxeles; antes iban de 74 a 104 px.
    expect(Math.max(...widths) - Math.min(...widths), `anchos de semana: ${widths.join('/')}`).toBeLessThanOrEqual(1);
  });

  test('la evolución por part da cuenta de las ocho parts', async ({ page }) => {
    await page.goto('/informe?w=60');
    const evolution = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Evolución por part' }) });
    const charts = await evolution.getByRole('img').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
    const missing = (await evolution.getByText(/^Sin práctica en estas semanas/).allInnerTexts()).join(' ');
    for (let part = 1; part <= 8; part++) {
      const drawn = charts.some((label) => label.startsWith(`Part ${String(part)}:`));
      const named = new RegExp(`Part ${String(part)}\\b`).test(missing);
      expect(drawn !== named, `Part ${String(part)}: dibujada ${String(drawn)}, nombrada ${String(named)}`).toBe(true);
    }
  });

  test('las falsas certezas se listan con periodo fijo y se leen en su detalle', async ({ page }) => {
    await page.goto('/certezas');
    await expect(page.getByText('últimos 30 días, periodo fijo')).toBeVisible();
    // La causa separa el despiste de lo que no se sabía: tiene su columna.
    await expect(page.getByRole('columnheader', { name: 'Causa' })).toBeVisible();
    const first = page.getByRole('button', { name: /^Ver error/ }).first();
    await first.click();
    await expect(page.getByRole('complementary', { name: 'Detalle del error' })).toContainText('Seguro');
  });

  test('cada consulta se descarga como CSV con su alcance a la vista', async ({ page }) => {
    await page.goto('/exportar');
    await expect(page.getByText('Siempre 30 días')).toBeVisible();
    await expect(page.getByText('Todo el historial')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar Reparto de causas' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('errorlog-q1.csv');
  });
});

test.describe('errores', () => {
  test('el detalle cuenta sobre todos los resultados y sus flechas cruzan de página', async ({ page }) => {
    await page.goto('/errores');
    const total = Number((await page.getByText(/^\d+ resultados$/).innerText()).split(' ')[0]);
    test.skip(total <= 25, 'hace falta más de una página de errores');

    await page.goto('/errores?p=2');
    await page.getByRole('button', { name: /^Ver error/ }).first().click();
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    await expect(panel).toContainText(`26 de ${String(total)}`);

    // Antes del primero de esta página va el último de la anterior, no el último de esta.
    await panel.getByRole('button', { name: 'Error anterior' }).click();
    await expect(page).toHaveURL(/p=1/);
    await expect(panel).toContainText(`25 de ${String(total)}`);
    await expect(page).not.toHaveURL(/at=/);
  });

  test('un error pendiente lleva a crear su tarjeta en Anki', async ({ page }) => {
    await page.goto('/errores?anki=pendiente');
    await page.getByRole('button', { name: /^Ver error/ }).first().click();
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    const correction = (await panel.locator('dd').nth(1).innerText()).trim();
    await panel.getByRole('link', { name: 'Crear la tarjeta' }).click();
    await expect(page).toHaveURL(/\/anki\?error=\d+/);
    await expect(page.getByRole('complementary', { name: 'Vista previa de la tarjeta' })).toContainText(correction);
  });

  test('busca en todos los errores, filtra por categoría desde Progreso y abre el detalle', async ({ page }) => {
    await page.goto('/informe?w=60');
    const category = page.getByRole('table', { name: /Categorías/ }).getByRole('link').first();
    const label = (await category.innerText()).trim();
    await category.click();
    await expect(page).toHaveURL(/\/errores\?cat=/);
    await expect(page.locator('span', { hasText: label }).filter({ has: page.getByRole('link', { name: `Quitar filtro ${label}` }) })).toBeVisible();

    const results = page.getByRole('button', { name: /^Ver error/ });
    await expect(results.first()).toBeVisible();
    await results.first().click();
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    await expect(panel).toContainText(label);
    // La selección viaja en la URL para poder enlazarla.
    await expect(page).toHaveURL(/error=\d+/);

    await page.getByRole('link', { name: `Quitar filtro ${label}` }).click();
    await expect(page).not.toHaveURL(/cat=/);

    await page.getByRole('searchbox', { name: 'Buscar errores' }).fill('zzz sin coincidencias zzz');
    await expect(page.getByText('Ningún error coincide con la búsqueda y los filtros activos.')).toBeVisible();
  });

  test('cada filtro se aplica al elegirlo, sin botón de aplicar, y se quita con su ×', async ({ page }) => {
    await page.goto('/errores');
    await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Causa', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Confusión' }).click();
    await expect(page).toHaveURL(/causa=CONFUSION/);
    await expect(page.getByRole('button', { name: 'Causa: Confusión' })).toBeVisible();

    await page.getByRole('link', { name: 'Quitar filtro Confusión' }).click();
    await expect(page).not.toHaveURL(/causa=/);
    await expect(page.getByRole('button', { name: 'Causa', exact: true })).toBeVisible();
  });
});
