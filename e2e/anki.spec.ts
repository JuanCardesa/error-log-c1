import { expect, test } from '@playwright/test';

test('Anki no disponible: aviso claro, repasos vacíos y creación deshabilitada', async ({ page }, testInfo) => {
  await page.goto('/anki');
  await expect(page.getByRole('heading', { name: 'Anki', exact: true })).toBeVisible();
  await expect(page.getByText('Anki está desactivado en la demo y en las pruebas.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear en Anki' }).first()).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Repaso en Anki' })).toBeVisible();
  await expect(page.getByText('Todavía no hay datos importados.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conexión con Anki' }).getByRole('alert')).toContainText('Anki está desactivado');
  await page.getByText('Cómo conectar Anki', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'AnkiConnect (2055492159)' })).toBeVisible();
  await page.getByRole('link', { name: '60 d' }).click();
  await expect(page).toHaveURL(/w=60/);
  await page.screenshot({ path: testInfo.outputPath('anki-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('anki-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Q7 está disponible en CSV y en el dump aunque no se haya sincronizado', async ({ page, request }) => {
  await page.goto('/exportar');
  await expect(page.getByRole('link', { name: /Repasos y fallos en Anki/ })).toBeVisible();
  const response = await request.get('/exportar/q7.csv');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('categoria,repasos,fallos,cartas_distintas,pct_aciertos');
  const dump = await (await request.get('/exportar/dump.json')).json() as { anki: { reviews: unknown[] }; queries: { q7: { accuracy: number | null } } };
  expect(dump.anki.reviews).toEqual([]);
  expect(dump.queries.q7.accuracy).toBeNull();
});

test('el informe no presenta falta de sincronización como cero fallos', async ({ page }) => {
  await page.goto('/informe');
  await expect(page.getByRole('heading', { name: 'Práctica y repaso en Anki' })).toBeVisible();
  await expect(page.getByText('Todavía no has sincronizado Anki.', { exact: false })).toBeVisible();
  await expect(page.getByRole('table', { name: /siete reglas/ }).locator('tbody tr')).toHaveCount(7);
});
