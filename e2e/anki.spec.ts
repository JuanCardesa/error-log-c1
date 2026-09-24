import { expect, test } from '@playwright/test';

// Anki sin sincronizar todavía. Lo que ocurre con Anki respondiendo, cerrado o fallando
// está en anki-sync.spec.ts, contra el doble que arranca Playwright.
test('sin sincronizar: explica cómo conectar y no presenta el vacío como cero fallos', async ({ page }, testInfo) => {
  await page.goto('/anki');
  await expect(page.getByRole('heading', { name: 'Anki', exact: true })).toBeVisible();
  await expect(page.getByText('Sin sincronizar todavía')).toBeVisible();
  // La cola cuenta todo el historial y se dice así.
  await expect(page.getByText(/pendientes$/).first()).toBeVisible();
  await expect(page.getByText('en todo el historial · más antiguos primero')).toBeVisible();

  await page.getByText('Conexión y cómo conectar Anki').click();
  await expect(page.getByRole('link', { name: 'AnkiConnect (2055492159)' })).toBeVisible();

  await page.getByRole('link', { name: 'Repasos', exact: true }).click();
  await expect(page).toHaveURL(/tab=repasos/);
  await expect(page.getByText('Todavía no hay datos importados: no son cero fallos.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: '60 días' }).click();
  await expect(page).toHaveURL(/tab=repasos/);
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
  const csv = await response.text();
  expect(csv).toContain('categoria,repasos,fallos,lapsos,fallos_aprendiendo,cartas_distintas,pct_aciertos');
  // Sin sincronizar, solo la cabecera: ni una tasa inventada ni una fila de relleno.
  expect(csv.trim().split('\r\n')).toHaveLength(1);
  const dump = await (await request.get('/exportar/dump.json')).json() as { anki: { reviews: unknown[] } };
  expect(dump.anki.reviews).toEqual([]);
});
