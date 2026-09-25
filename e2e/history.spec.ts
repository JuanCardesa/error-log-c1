import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { countSessions, listSessions } from '../src/lib/db/repo';
import { E2E_DB } from './globalSetup';

test('pagina el historial, abre una sesión antigua y vuelve con el filtro conservado', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('8');
  await page.getByLabel('Referencia').fill('Prueba del historial');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page).toHaveURL(/s=\d+/);
  const db = createDb(E2E_DB);
  let oldest;
  try {
    expect(countSessions(db)).toBeGreaterThan(12);
    oldest = listSessions(db, 1, countSessions(db) - 1)[0];
  } finally { db.$client.close(); }
  if (oldest === undefined) throw new Error('Falta una sesion antigua');

  await page.goto('/registrar');
  const pages = page.getByRole('navigation', { name: 'Páginas de sesiones' });
  await pages.getByRole('link', { name: 'Siguientes' }).click();
  await expect(page).toHaveURL(/p=2/);

  // Un número fuera de rango se limita a la última página con datos.
  await page.goto('/registrar?p=999999');
  await expect(pages.getByRole('link', { name: 'Siguientes' })).toHaveCount(0);
  await page.locator(`a[href="/registrar?s=${String(oldest.id)}"]`).click();
  await expect(page).toHaveURL(new RegExp(`s=${String(oldest.id)}`));

  // Volver lleva a la misma página del historial, no a la primera.
  const back = page.getByRole('link', { name: /Sesiones.*filtro conservado/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/p=\d+/);
});

test('busca por referencia y filtra las abiertas', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByLabel('Ítems intentados').fill('6');
  await page.getByLabel('Aciertos', { exact: true }).fill('4');
  await page.getByLabel('Referencia').fill('Referencia buscable XYZ');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page).toHaveURL(/s=\d+/);

  await page.goto('/registrar');
  await page.getByRole('searchbox', { name: 'Buscar sesión' }).fill('buscable xyz');
  await expect(page).toHaveURL(/q=buscable/);
  await expect(page.getByRole('link', { name: 'Referencia buscable XYZ' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Sesiones' }).getByRole('row')).toHaveCount(2);

  await page.getByRole('searchbox', { name: 'Buscar sesión' }).fill('no existe ninguna asi');
  await expect(page.getByText('Ninguna sesión coincide con «no existe ninguna asi».')).toBeVisible();

  await page.goto('/registrar?estado=abiertas');
  await expect(page.getByRole('link', { name: 'Referencia buscable XYZ' })).toBeVisible();
  for (const status of await page.getByRole('table', { name: 'Sesiones' }).locator('tbody tr').allInnerTexts()) {
    expect(status).toContain('Abierta');
  }
});

test('un identificador de sesión que no existe no abre el alta', async ({ page }) => {
  await page.goto('/registrar?s=99999999');
  await expect(page.getByRole('heading', { name: 'No encontramos esta sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Sesiones' })).toBeVisible();
});
