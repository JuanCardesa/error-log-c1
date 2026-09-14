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
async function openSession(page: Page, reference: string) {
  await page.goto('/registrar');
  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('5');
  await page.getByLabel('Referencia').fill(reference);
  await page.getByRole('button', { name: 'Abrir sesion' }).click();

  // Al crearla se entra en ella, asi que la captura ya tiene que estar disponible.
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
}

test.describe('registrar una sesion y sus errores', () => {
  test('rechaza una cabecera invalida antes de aceptar ningun error', async ({ page }) => {
    await page.goto('/registrar');

    // Mas aciertos que items: la sesion no debe abrirse.
    await page.getByLabel('Items *').fill('6');
    await page.getByLabel('Aciertos *').fill('9');
    await page.getByRole('button', { name: 'Abrir sesion' }).click();

    await expect(page.locator('#s-itemsCorrect-error')).toContainText(
      'No puedes acertar mas items de los que intentaste',
    );
    // Y sin sesion valida no aparece la entrada de errores.
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeHidden();
  });

  test('abre una sesion y registra dos errores seguidos', async ({ page }) => {
    await openSession(page, 'Unidad 7, ej. 2');

    await page.getByLabel('Enunciado *').fill('He ______ up smoking last year. (GAVE)');
    await page.getByLabel('Correcta *').fill('gave up');
    await page.getByLabel('Categoria *').fill('PHRASAL_VERB');
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('give up es separable pero no con pronombre detras');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();

    // Segundo error: la categoria del anterior sigue puesta, que es el punto.
    await expect(page.getByLabel('Categoria *')).toHaveValue('PHRASAL_VERB');

    await page.getByLabel('Enunciado *').fill('She ______ on her parents. (RELIES)');
    await page.getByLabel('Correcta *').fill('relies');
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('rely siempre lleva on, nunca in ni of');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    await expect(page.getByRole('cell', { name: 'relies' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'gave up' })).toBeVisible();
  });

  test('exige una regla escrita y no admite copiar la respuesta', async ({ page }) => {
    await openSession(page, 'Unidad 8, regla copiada');

    await page.getByLabel('Enunciado *').fill('Prueba de regla copiada');
    await page.getByLabel('Correcta *').fill('una respuesta suficientemente larga');
    await page.getByLabel('Categoria *').fill('LEXICO');
    await page
      .getByLabel('Regla, con tus palabras *')
      .fill('una respuesta suficientemente larga');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    // Se apunta al error del campo: el anunciador de rutas de Next tambien es role=alert.
    await expect(page.locator('[data-field="ruleNote"]')).toContainText(
      'no puede ser la respuesta correcta',
    );
  });

  test('conmuta entre grid y card sin perder el formulario', async ({ page }) => {
    await openSession(page, 'Unidad 9, variantes');

    await page.getByLabel('Enunciado *').fill('texto que debe sobrevivir');

    await page.getByRole('button', { name: 'Card' }).click();
    await expect(page.getByRole('button', { name: 'Card' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Enunciado *')).toHaveValue('texto que debe sobrevivir');

    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
