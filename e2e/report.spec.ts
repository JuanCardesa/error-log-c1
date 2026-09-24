import { expect, test } from '@playwright/test';

/**
 * Progreso y las vistas de detalle. La propiedad que da sentido al motor: se destaca
 * **una sola** recomendación, con la cifra que la justifica.
 */

test.describe('progreso', () => {
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
    for (const name of ['Sesiones', 'Errores', 'Progreso', 'Anki']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Progreso', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Anki', exact: true })).not.toHaveAttribute('aria-current', 'page');

    // Writing y Exportar, a un clic en «Más».
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('menuitem', { name: 'Writing' })).toBeVisible();
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

  test('las falsas certezas se listan con periodo fijo y se leen en su detalle', async ({ page }) => {
    await page.goto('/certezas');
    await expect(page.getByText('últimos 30 días, periodo fijo')).toBeVisible();
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
});
