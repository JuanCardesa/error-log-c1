import { expect, test } from '@playwright/test';

test('registra practica libre, conserva la edicion y permite cambiar de formato', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'Nueva sesión a mano' }).click();
  await page.getByRole('combobox', { name: /^Part\b/ }).selectOption('8');
  await page.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('');
  await expect(page.getByRole('combobox', { name: /^Part\b/ })).toHaveCount(0);
  await page.getByLabel('Referencia').fill('Libro, unidad 4, ejercicio libre');
  await page.getByLabel('Items *').fill('10');
  await page.getByLabel('Aciertos *').fill('12');
  await page.getByRole('button', { name: 'Abrir sesion' }).click();
  await expect(page.locator('#s-itemsCorrect-error')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Paper', exact: true })).toHaveValue('');
  await page.getByLabel('Aciertos *').fill('8');
  await page.getByRole('button', { name: 'Abrir sesion' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sin formato de examen');
  const sessionUrl = page.url();

  await page.getByLabel('Enunciado *').fill('She is interested ___ science.');
  await page.getByLabel('Correcta *').fill('in');
  await page.getByLabel('Categoria *').selectOption('PREPOSICION_DEPENDIENTE');
  await page.getByLabel('Regla, con tus palabras *').fill('Interested se construye con la preposicion in.');
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();
  await expect(page.getByRole('cell', { name: 'in', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Corregir cabecera' }).click();
  await expect(page.getByRole('combobox', { name: 'Paper', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: /^Part\b/ })).toHaveCount(0);
  await page.getByLabel('Referencia').fill('Libro, unidad 4, referencia corregida');
  await page.getByRole('button', { name: 'Guardar cabecera' }).click();
  await expect(page.getByRole('button', { name: 'Corregir cabecera' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sin formato de examen');

  await page.getByRole('button', { name: 'Corregir cabecera' }).click();
  await page.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('LISTENING');
  await expect(page.getByRole('combobox', { name: /^Part\b/ })).toHaveValue('1');
  await page.getByRole('combobox', { name: /^Part\b/ }).selectOption('4');
  await page.getByRole('button', { name: 'Guardar cabecera' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('LISTENING Part 4');
  await page.getByRole('button', { name: 'Corregir cabecera' }).click();
  await page.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Guardar cabecera' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sin formato de examen');
  await expect(page.getByRole('cell', { name: 'in', exact: true })).toBeVisible();

  await page.goto('/registrar');
  const link = page.locator(`a[href="${new URL(sessionUrl).pathname}${new URL(sessionUrl).search}"]`);
  await expect(link).toContainText('Sin formato de examen');
  await expect(link).not.toContainText('P1');
});

test('elegir tipo Writing exige su paper y muestra una part valida', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'Nueva sesión a mano' }).click();
  await page.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('WRITING');
  await expect(page.getByRole('combobox', { name: 'Paper', exact: true })).toHaveValue('WRITING');
  await expect(page.getByRole('combobox', { name: /^Part\b/ })).toHaveValue('1');
  await expect(page.locator('select[name="paper"] option[value=""]')).toHaveJSProperty('disabled', true);
});
