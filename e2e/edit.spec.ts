import { type Page, expect, test } from '@playwright/test';

/**
 * Corregir lo ya registrado (§6).
 *
 * Es la parte del CRUD que faltaba: se podia crear, cerrar, reabrir y borrar, pero no
 * arreglar un numero mal tecleado ni una regla mal escrita.
 */

async function openSessionWithError(page: Page, reference: string) {
  await page.goto('/registrar');
  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('5');
  await page.getByLabel('Referencia').fill(reference);
  await page.getByRole('button', { name: 'Abrir sesion' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();

  await page.getByLabel('Enunciado *').fill('He ______ up smoking. (GAVE)');
  await page.getByLabel('Correcta *').fill('gave up');
  await page.getByLabel('Categoria *').fill('PHRASAL_VERB');
  await page
    .getByLabel('Regla, con tus palabras *')
    .fill('give up es separable pero no con pronombre detras');
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();
  await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
}

test.describe('corregir lo ya registrado', () => {
  test('corrige una fila de error en su sitio', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 10, correccion');

    await page.getByRole('button', { name: 'Editar' }).first().click();

    // El formulario sale con los valores actuales, no en blanco.
    const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });
    await expect(editForm.getByLabel('Correcta *')).toHaveValue('gave up');
    await expect(editForm.getByLabel('Categoria *')).toHaveValue('PHRASAL_VERB');

    await editForm.getByLabel('Correcta *').fill('given up');
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByRole('cell', { name: 'given up' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'gave up', exact: true })).toBeHidden();
  });

  test('la correccion pasa por la misma validacion que el alta', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 11, validacion');

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });

    // Copiar la respuesta en la regla se rechaza tambien al corregir. Se usa un texto
    // largo a proposito: con uno corto saltaria antes el minLength nativo del navegador
    // y no se probaria la regla del servidor.
    const answer = 'it was only by his voice that I recognised him';
    await editForm.getByLabel('Correcta *').fill(answer);
    await editForm.getByLabel('Regla, con tus palabras *').fill(answer);
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(editForm.locator('[data-field="ruleNote"]')).toContainText(
      'no puede ser la respuesta correcta',
    );
  });

  test('cancelar deja la fila como estaba', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 12, cancelar');

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });
    await editForm.getByLabel('Correcta *').fill('otra cosa');
    await editForm.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
  });

  test('corrige la cabecera de una sesion pasada', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 13, cabecera');

    await page.getByRole('button', { name: 'Corregir cabecera' }).click();
    await expect(page.getByRole('heading', { name: /Corregir sesion/ })).toBeVisible();

    await page.getByLabel('Aciertos *').fill('7');
    await page.getByRole('button', { name: 'Guardar cabecera' }).click();

    // Vuelve a la vista de datos con el numero corregido, sin tocar los errores.
    await expect(page.getByText('7 / 8')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
  });

  test('la cabecera corregida sigue sin admitir mas aciertos que items', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 14, cabecera invalida');

    await page.getByRole('button', { name: 'Corregir cabecera' }).click();
    await page.getByLabel('Aciertos *').fill('99');
    await page.getByRole('button', { name: 'Guardar cabecera' }).click();

    await expect(page.locator('#s-itemsCorrect-error')).toContainText(
      'No puedes acertar mas items de los que intentaste',
    );
  });
});
