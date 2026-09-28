import { type Page, expect, test } from '@playwright/test';

/**
 * Corregir lo ya registrado (§6): leer un error en su detalle y editarlo en el mismo
 * panel, sin salir de la sesión, y corregir la cabecera en el drawer.
 */

const panel = (page: Page) => page.getByRole('complementary', { name: 'Detalle del error' });
const editRule = (page: Page) => panel(page).getByRole('textbox', { name: 'Regla', exact: true });

async function openSessionWithError(page: Page, reference: string) {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('5');
  await page.getByLabel('Referencia').fill(reference);
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();

  await page.getByLabel('Enunciado', { exact: true }).fill('He ______ up smoking. (GAVE)');
  await page.getByLabel('Corrección', { exact: true }).fill('gave up');
  await page.getByLabel('Categoría', { exact: true }).selectOption('PHRASAL_VERB');
  await page.getByRole('textbox', { name: 'Regla', exact: true }).fill('give up es separable pero no con pronombre detras');
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();
  await expect(page.getByRole('button', { name: /Ver error: gave up/ })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar' }).click();
}

async function editFirstError(page: Page) {
  await page.getByRole('button', { name: /Ver error: / }).first().click();
  await panel(page).getByRole('button', { name: 'Editar error' }).click();
}

test('conserva el borrador al guardar un error borrado desde otra pestaña', async ({ page, context }) => {
  await openSessionWithError(page, 'Edicion concurrente');
  const other = await context.newPage();
  try {
    await other.goto(page.url());
    await editFirstError(page);
    await panel(page).getByLabel('Corrección', { exact: true }).fill('mi correccion pendiente');

    await editFirstError(other);
    await panel(other).getByRole('button', { name: 'Borrar error…' }).click();
    await other.getByRole('alertdialog').getByRole('button', { name: 'Borrar error' }).click();
    await expect(other.getByRole('button', { name: /Ver error: / })).toHaveCount(0);

    await panel(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ya no existe' })).toBeVisible();
    await expect(panel(page).getByLabel('Corrección', { exact: true })).toHaveValue('mi correccion pendiente');
  } finally { await other.close(); }
});

test.describe('corregir lo ya registrado', () => {
  test('lee el error entero y lo corrige en el panel', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 10, correccion');

    // Leer no exige editar: el detalle trae enunciado, regla y clasificación.
    await page.getByRole('button', { name: /Ver error: gave up/ }).click();
    await expect(panel(page).getByRole('button', { name: 'Cerrar detalle' })).toBeFocused();
    await expect(panel(page)).toContainText('He ______ up smoking. (GAVE)');
    await expect(panel(page)).toContainText('give up es separable');
    await expect(panel(page)).toContainText('Phrasal verb');

    await panel(page).getByRole('button', { name: 'Editar error' }).click();
    // El formulario sale con los valores actuales, no en blanco.
    await expect(panel(page).getByLabel('Corrección', { exact: true })).toHaveValue('gave up');
    await expect(panel(page).getByLabel('Categoría', { exact: true })).toHaveValue('PHRASAL_VERB');

    await panel(page).getByLabel('Corrección', { exact: true }).fill('given up');
    await panel(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('button', { name: /Ver error: given up/ })).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Editar error' })).toBeFocused();

    // Escape sale de la edición sin guardar y el foco vuelve a «Editar error».
    await panel(page).getByRole('button', { name: 'Editar error' }).click();
    await panel(page).getByLabel('Corrección', { exact: true }).fill('otra cosa');
    await page.keyboard.press('Escape');
    await expect(panel(page).getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Editar error' })).toBeFocused();
    await expect(page.getByRole('button', { name: /Ver error: given up/ })).toBeVisible();

    // Un segundo Escape cierra el detalle.
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Ver error: given up/ })).toBeFocused();
  });

  test('conserva los cambios de un error cuando falla la validacion', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 11, validacion');
    await editFirstError(page);

    // Copiar la respuesta en la regla se rechaza también al corregir. Texto largo a
    // propósito: con uno corto saltaría antes el minLength nativo del navegador.
    const answer = 'it was only by his voice that I recognised him';
    await panel(page).getByLabel('Enunciado', { exact: true }).fill('Enunciado corregido');
    await panel(page).getByLabel('Corrección', { exact: true }).fill(answer);
    await editRule(page).fill(answer);
    await panel(page).getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(panel(page).locator('[data-field="ruleNote"]')).toContainText('no puede ser la respuesta correcta');
    await expect(panel(page).getByLabel('Enunciado', { exact: true })).toHaveValue('Enunciado corregido');
    await expect(panel(page).getByLabel('Corrección', { exact: true })).toHaveValue(answer);
    await expect(editRule(page)).toHaveValue(answer);

    const rule = 'La estructura enfatica destaca la voz como unica pista';
    await editRule(page).fill(rule);
    await panel(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(panel(page)).toContainText(rule);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`Ver error: ${answer}`) }).click();
    await expect(panel(page)).toContainText(rule);
  });

  test('cancelar deja el error como estaba', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 12, cancelar');
    await editFirstError(page);
    await panel(page).getByLabel('Corrección', { exact: true }).fill('otra cosa');
    await panel(page).getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('button', { name: /Ver error: gave up/ })).toBeVisible();
    await expect(panel(page)).toContainText('gave up');
  });

  test('corrige la cabecera de una sesion pasada', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 13, cabecera');

    await page.getByRole('button', { name: 'Más acciones de la sesión' }).click();
    await page.getByRole('menuitem', { name: 'Editar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Editar sesión' })).toBeVisible();

    await page.getByLabel('Aciertos', { exact: true }).fill('7');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Vuelve a la sesión con el número corregido, sin tocar los errores.
    await expect(page.getByText('7 / 8 aciertos', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver error: gave up/ })).toBeVisible();
  });

  test('conserva la cabecera corregida si los aciertos son invalidos', async ({ page }) => {
    await openSessionWithError(page, 'Unidad 14, cabecera invalida');

    await page.getByRole('button', { name: 'Más acciones de la sesión' }).click();
    await page.getByRole('menuitem', { name: 'Editar sesión' }).click();
    await page.getByLabel('Aciertos', { exact: true }).fill('99');
    await page.getByLabel('Referencia').fill('Referencia corregida');
    await page.getByText('Tiempo y duración').click();
    await page.getByLabel('Cronometrada').check();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.locator('[data-field="itemsCorrect"]')).toContainText(
      'No puedes acertar más ítems de los que intentaste',
    );
    await expect(page.getByLabel('Aciertos', { exact: true })).toHaveValue('99');
    await expect(page.getByLabel('Referencia')).toHaveValue('Referencia corregida');
    await expect(page.getByLabel('Cronometrada')).toBeChecked();
    await page.getByLabel('Aciertos', { exact: true }).fill('7');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('7 / 8 aciertos', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Referencia corregida', level: 1 })).toBeVisible();
  });
});
