import { expect, test } from '@playwright/test';

/**
 * Flujo 2: el informe del domingo.
 *
 * Lo que se comprueba es la propiedad que da sentido al motor: se destaca **una sola**
 * accion. Un informe con cinco urgencias a la vez no ha decidido nada.
 */

test.describe('informe semanal', () => {
  test('destaca exactamente una accion', async ({ page }) => {
    await page.goto('/informe');

    const doNow = page.locator('text=Haz esto');
    await expect(doNow.first()).toBeVisible();

    // La tabla es el respaldo, no la portada: se abre para comprobarla.
    await page.getByText('Ver las siete reglas y sus cifras').click();

    // La propiedad, no el ejemplo: nunca dos «Haz esto» en la tabla.
    const statuses = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
    const doNowCount = statuses.filter((status) => status.trim() === 'Haz esto').length;
    expect(doNowCount).toBe(1);
  });

  test('explica por que se dispara la accion destacada', async ({ page }) => {
    await page.goto('/informe');

    // La accion sin la cifra no se cree: tiene que decir señal, valor y umbral.
    const why = page.locator('p', { hasText: 'umbral' }).first();
    await expect(why).toContainText('muestra de');
  });

  test('las siete reglas aparecen con su estado al desplegarlas', async ({ page }) => {
    await page.goto('/informe');
    await page.getByText('Ver las siete reglas y sus cifras').click();

    // Se cuenta solo la tabla de decision, no las de Q1 y Q2 que van en la misma pagina.
    // El nombre accesible de una tabla sale de su <caption>.
    const rulesTable = page.getByRole('table', { name: /siete reglas/ });
    await expect(rulesTable.locator('tbody tr')).toHaveCount(7);
    await expect(rulesTable).toBeVisible();
  });

  test('las vistas de detalle siguen accesibles desde la navegacion', async ({ page }) => {
    await page.goto('/informe');

    // Pasaron a un grupo secundario: deben seguir a un clic, no desaparecer.
    for (const name of ['RUOE', 'Falsas certezas', 'Writing', 'Exportar']) {
      await expect(page.getByRole('navigation', { name: 'Secciones' })
        .getByRole('link', { name, exact: true })).toBeVisible();
    }

    // Y la barra dice donde estas.
    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav.getByRole('link', { name: 'Informe', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Anki', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('la ventana de 60 dias cambia el encuadre y se mantiene en la URL', async ({
    page,
  }) => {
    await page.goto('/informe');
    await page.getByRole('link', { name: '60 d' }).click();

    await expect(page).toHaveURL(/w=60/);
    await expect(page.getByText('Últimos 60 días')).toBeVisible();
  });

  test('RUOE distingue una celda sin datos de un cero', async ({ page }) => {
    await page.goto('/ruoe');
    // "Sin datos" es texto para lector de pantalla: una celda vacia no es un 0%.
    await expect(page.getByText('Sin datos').first()).toBeAttached();
  });

  test('las falsas certezas se listan una a una', async ({ page }) => {
    await page.goto('/certezas');
    await expect(page.getByRole('heading', { name: 'Falsas certezas' })).toBeVisible();
    await expect(page.locator('li').first()).toBeVisible();
  });

  test('cada consulta se descarga como CSV', async ({ page }) => {
    await page.goto('/exportar');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Reparto de causas/ }).click(),
    ]);

    expect(download[0].suggestedFilename()).toBe('errorlog-q1.csv');
  });
});
