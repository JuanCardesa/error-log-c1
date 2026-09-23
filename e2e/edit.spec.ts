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
  await page.getByLabel('Categoria *').selectOption('PHRASAL_VERB');
  await page
    .getByLabel('Regla, con tus palabras *')
    .fill('give up es separable pero no con pronombre detras');
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();
  await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
}

test('conserva el borrador al guardar un error borrado desde otra pestaña', async ({ page, context }) => {
  await openSessionWithError(page, 'Edicion concurrente');
  const other = await context.newPage();
  try {
    await other.goto(page.url());
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });
    await editForm.getByLabel('Correcta *').fill('mi correccion pendiente');
    const table = other.getByRole('table', { name: 'Errores registrados en esta sesion' });
    await table.getByRole('button', { name: 'Borrar…', exact: true }).click();
    await table.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(table).toHaveCount(0);
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ya no existe' })).toBeVisible();
    await expect(editForm.getByLabel('Correcta *')).toHaveValue('mi correccion pendiente');
  } finally { await other.close(); }
});

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

  test('conserva los cambios de un error cuando falla la validacion', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 11, validacion');

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });

    // Copiar la respuesta en la regla se rechaza tambien al corregir. Se usa un texto
    // largo a proposito: con uno corto saltaria antes el minLength nativo del navegador
    // y no se probaria la regla del servidor.
    const answer = 'it was only by his voice that I recognised him';
    await editForm.getByLabel('Enunciado *').fill('Enunciado corregido');
    await editForm.getByLabel('Correcta *').fill(answer);
    await editForm.getByLabel('Regla, con tus palabras *').fill(answer);
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(editForm.locator('[data-field="ruleNote"]')).toContainText(
      'no puede ser la respuesta correcta',
    );
    await expect(editForm.getByLabel('Enunciado *')).toHaveValue('Enunciado corregido');
    await expect(editForm.getByLabel('Correcta *')).toHaveValue(answer);
    await expect(editForm.getByLabel('Regla, con tus palabras *')).toHaveValue(answer);

    const rule = 'La estructura enfatica destaca la voz como unica pista';
    await editForm.getByLabel('Regla, con tus palabras *').fill(rule);
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('cell', { name: answer, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('cell', { name: rule, exact: true })).toBeVisible();
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

  test('conserva la cabecera corregida si los aciertos son invalidos', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 14, cabecera invalida');

    await page.getByRole('button', { name: 'Corregir cabecera' }).click();
    await page.getByLabel('Aciertos *').fill('99');
    await page.getByLabel('Referencia').fill('Referencia corregida');
    await page.getByLabel('Cronometrada').check();
    await page.getByRole('button', { name: 'Guardar cabecera' }).click();

    await expect(page.locator('#s-itemsCorrect-error')).toContainText(
      'No puedes acertar mas items de los que intentaste',
    );
    await expect(page.getByLabel('Aciertos *')).toHaveValue('99');
    await expect(page.getByLabel('Referencia')).toHaveValue('Referencia corregida');
    await expect(page.getByLabel('Cronometrada')).toBeChecked();
    await page.getByLabel('Aciertos *').fill('7');
    await page.getByRole('button', { name: 'Guardar cabecera' }).click();
    await expect(page.getByText('7 / 8', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('LIBRO · Referencia corregida', { exact: true })).toBeVisible();
  });
});
