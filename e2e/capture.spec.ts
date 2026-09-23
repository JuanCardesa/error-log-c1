import { type Page, expect, test } from '@playwright/test';

/**
 * Flujo 1: abrir una sesion y volcar errores.
 *
 * Es el flujo que decide si el proyecto sirve: si dar de alta un error cuesta dos
 * minutos, el log se abandona en tres semanas. Por eso lo que se comprueba aqui no es
 * solo que guarde, sino que se pueda hacer del tirado con el teclado y que los defaults
 * sobrevivan de un error al siguiente.
 */

/** Abre una sesion nueva y deja la pagina dentro de ella, lista para capturar. */
async function openSession(page: Page, reference: string, timed = false) {
  await page.goto('/registrar');
  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('5');
  await page.getByLabel('Referencia').fill(reference);
  if (timed) await page.getByLabel('Cronometrada').check();
  await page.getByRole('button', { name: 'Abrir sesion' }).click();

  // Al crearla se entra en ella, asi que la captura ya tiene que estar disponible.
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
}

test.describe('registrar una sesion y sus errores', () => {
  test('conserva la cabecera invalida y permite corregirla', async ({ page }) => {
    await page.goto('/registrar');

    // Mas aciertos que items: la sesion no debe abrirse.
    await page.getByLabel('Items *').fill('6');
    await page.getByLabel('Aciertos *').fill('9');
    await page.getByLabel('Referencia').fill('Cabecera pendiente');
    await page.getByRole('combobox', { name: 'Fuente' }).selectOption('TRAINER');
    await page.getByLabel('Cronometrada').check();
    await page.getByRole('button', { name: 'Abrir sesion' }).click();

    await expect(page.locator('#s-itemsCorrect-error')).toContainText(
      'No puedes acertar mas items de los que intentaste',
    );
    // Y sin sesion valida no aparece la entrada de errores.
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeHidden();
    await expect(page.getByLabel('Items *')).toHaveValue('6');
    await expect(page.getByLabel('Aciertos *')).toHaveValue('9');
    await expect(page.getByLabel('Referencia')).toHaveValue('Cabecera pendiente');
    await expect(page.getByRole('combobox', { name: 'Fuente' })).toHaveValue('TRAINER');
    await expect(page.getByLabel('Cronometrada')).toBeChecked();

    // Un segundo rechazo tampoco debe limpiar el formulario.
    await page.getByLabel('Aciertos *').fill('8');
    await page.getByRole('button', { name: 'Abrir sesion' }).click();
    await expect(page.locator('#s-itemsCorrect-error')).toBeVisible();
    await expect(page.getByLabel('Aciertos *')).toHaveValue('8');
    await page.getByLabel('Aciertos *').fill('5');
    await page.getByRole('button', { name: 'Abrir sesion' }).click();
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
    await expect(page.getByText('5 / 6', { exact: true })).toBeVisible();
  });

  test('abre una sesion y registra dos errores seguidos', async ({ page }) => {
    await openSession(page, 'Unidad 7, ej. 2');

    // Se entra para volcar: el cursor ya esta en el primer campo. Sin cronometro, la
    // casilla de final de sesion no significa nada y no se ofrece.
    await expect(page.getByLabel('Item', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Al final de la sesion')).toHaveCount(0);

    await page.getByLabel('Enunciado *').fill('He ______ up smoking last year. (GAVE)');
    await page.getByLabel('Correcta *').fill('gave up');
    await page.getByLabel('Categoria *').selectOption('PHRASAL_VERB');
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('give up es separable pero no con pronombre detras');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();

    // Segundo error: la categoria del anterior sigue puesta, que es el punto, y se dice
    // que viene heredada para que no se guarde sin mirarla.
    await expect(page.getByLabel('Categoria *')).toHaveValue('PHRASAL_VERB');
    await expect(page.getByLabel('Categoria *')).toHaveAccessibleDescription(/heredada/);
    await expect(page.getByLabel('Enunciado *')).toHaveValue('');
    await expect(page.getByLabel('Correcta *')).toHaveValue('');
    await expect(page.getByLabel('Item', { exact: true })).toBeFocused();

    await page.getByLabel('Enunciado *').fill('She ______ on her parents. (RELIES)');
    await page.getByLabel('Correcta *').fill('relies');
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('rely siempre lleva on, nunca in ni of');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    await expect(page.getByRole('cell', { name: 'relies' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
  });

  test('conserva el error rechazado y limpia solo al guardar', async ({ page }) => {
    await openSession(page, 'Unidad 8, regla copiada', true);

    await page.getByLabel('Item', { exact: true }).fill('4');
    await page.getByLabel('Enunciado *').fill('Prueba de regla copiada');
    await page.getByLabel('Mi respuesta', { exact: true }).fill('mi intento');
    await page.getByLabel('Correcta *').fill('una respuesta suficientemente larga');
    await page.getByLabel('Categoria *').selectOption('LEXICO');
    await page.getByLabel('Subcategoria', { exact: true }).fill('contraste');
    await page.getByRole('combobox', { name: /^Causa/ }).selectOption('CONFUSION');
    await page.getByRole('combobox', { name: 'Confianza', exact: true }).selectOption('SEGURO');
    await page.getByLabel('Al final de la sesion').check();
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('una respuesta suficientemente larga');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    // Se apunta al error del campo: el anunciador de rutas de Next tambien es role=alert.
    await expect(page.locator('[data-field="ruleNote"]')).toContainText(
      'no puede ser la respuesta correcta',
    );
    await expect(page.getByLabel('Item', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('Enunciado *')).toHaveValue('Prueba de regla copiada');
    await expect(page.getByLabel('Mi respuesta', { exact: true })).toHaveValue('mi intento');
    await expect(page.getByLabel('Correcta *')).toHaveValue('una respuesta suficientemente larga');
    await expect(page.getByLabel('Regla, con tus palabras *')).toHaveValue('una respuesta suficientemente larga');
    await expect(page.getByLabel('Al final de la sesion')).toBeChecked();

    const rule = 'Regla corregida con una explicacion distinta de la respuesta';
    await page.getByLabel('Regla, con tus palabras *').fill(rule);
    await page.getByRole('combobox', { name: /^Causa/ }).selectOption('CONFUSION');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByRole('cell', { name: rule, exact: true })).toBeVisible();
    await expect(page.getByLabel('Enunciado *')).toHaveValue('');
    await expect(page.getByLabel('Correcta *')).toHaveValue('');
    await expect(page.getByLabel('Regla, con tus palabras *')).toHaveValue('');
    await expect(page.getByLabel('Al final de la sesion')).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: /^Causa/ })).toHaveValue('CONFUSION');
    await expect(page.getByLabel('Categoria *')).toHaveValue('LEXICO');
    await expect(page.getByLabel('Subcategoria', { exact: true })).toHaveValue('contraste');
    await expect(page.getByRole('combobox', { name: 'Confianza', exact: true })).toHaveValue('SEGURO');
    await expect(page.getByLabel('Item', { exact: true })).toBeFocused();
  });

  test('ir a pegar una tanda y volver no se lleva el formulario', async ({ page }) => {
    await openSession(page, 'Unidad 9, variantes');

    await page.getByLabel('Enunciado *').fill('texto que debe sobrevivir');

    await page.getByRole('button', { name: 'Pegar varios errores', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pegar varios errores', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Uno a uno', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Uno a uno', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Enunciado *')).toHaveValue('texto que debe sobrevivir');
  });

  test('conserva el borrador y explica que otra pestaña ha cerrado la sesion', async ({ page }) => {
    await openSession(page, 'Sesion cerrada en otra pestaña');
    await page.getByLabel('Enunciado *').fill('Enunciado pendiente de guardar');
    await page.getByLabel('Correcta *').fill('given up');
    await page.getByLabel('Categoria *').selectOption('PHRASAL_VERB');
    await page.getByLabel('Regla, con tus palabras *').fill('give up expresa abandonar una actividad');

    const other = await page.context().newPage();
    try {
      await other.goto(page.url());
      await other.getByRole('button', { name: 'Cerrar sesion', exact: true }).click();
      await expect(other.getByRole('button', { name: 'Reabrir sesion', exact: true })).toBeVisible();
    } finally {
      await other.close();
    }

    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'La sesion esta cerrada.' })).toBeVisible();
    await expect(page.getByLabel('Enunciado *')).toHaveValue('Enunciado pendiente de guardar');
    await expect(page.getByLabel('Correcta *')).toHaveValue('given up');
  });
});
