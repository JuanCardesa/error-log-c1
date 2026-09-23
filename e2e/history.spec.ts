import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { countSessions, listSessions } from '../src/lib/db/repo';
import { E2E_DB } from './globalSetup';

test('permite abrir sesiones antiguas y volver a la primera pagina', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'Nueva sesión a mano' }).click();
  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('8');
  await page.getByLabel('Referencia').fill('Prueba del historial');
  await page.getByRole('button', { name: 'Abrir sesion' }).click();
  await expect(page).toHaveURL(/s=\d+/);
  const db = createDb(E2E_DB);
  let oldest;
  try {
    expect(countSessions(db)).toBeGreaterThan(12);
    oldest = listSessions(db, 1, countSessions(db) - 1)[0];
  } finally { db.$client.close(); }
  if (oldest === undefined) throw new Error('Falta una sesion antigua');

  await page.goto('/registrar');
  const pages = page.getByRole('navigation', { name: 'Paginas de sesiones' });
  await expect(pages.getByRole('link', { name: /Mas antiguas/ })).toBeVisible();
  await pages.getByRole('link', { name: /Mas antiguas/ }).click();
  await expect(page).toHaveURL(/p=2/);

  // Un numero fuera de rango se limita a la ultima pagina con datos.
  await page.goto('/registrar?p=999999');
  await expect(pages.getByRole('link', { name: /Mas antiguas/ })).toHaveCount(0);
  await page.locator(`a[href="/registrar?s=${String(oldest.id)}"]`).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(oldest.date);
  await page.getByRole('link', { name: /Todas las sesiones/ }).click();
  await expect(pages.getByRole('link', { name: /Mas recientes/ })).toHaveCount(0);
});
