import { expect, test, type Page } from '@playwright/test';

/**
 * Las capas que tapan la vista no dejan escapar el foco a lo de detrás, y el aviso se
 * anuncia y se puede deshacer con el teclado.
 */

const workspace = (page: Page) => page.getByRole('region', { name: 'Revisar importación' });

const row = { itemRef: '4', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };

/** Pulsa Tab `times` veces y devuelve las paradas que cayeron dentro de `<main>` pero fuera de la capa. */
async function stopsBehind(page: Page, layer: string, times = 20): Promise<readonly string[]> {
  const behind: string[] = [];
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate((selector) => {
      const active = document.activeElement;
      const inLayer = document.querySelector(selector)?.contains(active) ?? false;
      const inMain = document.querySelector('main')?.contains(active) ?? false;
      return inMain && !inLayer ? `${active?.tagName ?? '?'} ${active?.textContent?.trim().slice(0, 30) ?? ''}` : null;
    }, layer);
    if (stop !== null) behind.push(stop);
  }
  return behind;
}

test('el aviso existe como región viva antes de avisar y Ctrl+Z deshace fuera de un campo', async ({ page }) => {
  await page.goto('/registrar');
  await expect(page.getByRole('status').and(page.locator('[aria-live="polite"]'))).toHaveCount(1);

  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('5');
  await page.getByLabel('Referencia').fill('Capas: deshacer con teclado');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
  await page.getByRole('button', { name: 'Pegar varios' }).click();
  await page.getByLabel('Errores para añadir a esta sesión').fill(JSON.stringify([row, { ...row, itemRef: '5' }, { ...row, itemRef: '6' }]));
  await page.getByRole('button', { name: 'Revisar importación' }).click();
  await expect(workspace(page).getByText('3 errores listos para enviar')).toBeVisible();

  await workspace(page).getByRole('button', { name: 'Quitar error 1 de la tanda' }).click();
  await expect(workspace(page).getByText('2 errores listos para enviar')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /quitad/i })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveAttribute('aria-keyshortcuts', /Control\+Z/);

  // Dentro de un campo, Ctrl+Z es del campo; fuera, deshace el aviso.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.keyboard.press('Control+z');
  await expect(workspace(page).getByText('3 errores listos para enviar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el detalle de un error deja inerte la tabla de detrás', async ({ page }) => {
    await page.goto('/errores');
    await page.locator('[data-error-row]').first().click();
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    await expect(panel).toBeVisible();
    expect(await stopsBehind(page, 'aside[aria-label="Detalle del error"]')).toEqual([]);

    await panel.getByRole('button', { name: 'Cerrar detalle' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('main [inert]')).toHaveCount(0);
  });

  test('el drawer a pantalla completa no deja escapar el foco', async ({ page }) => {
    await page.goto('/registrar');
    await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
    const drawer = page.locator('aside[data-overlay-open]');
    await expect(drawer).toBeVisible();
    expect(await stopsBehind(page, 'aside[data-overlay-open]')).toEqual([]);
  });
});
