import { type Page, expect, test } from '@playwright/test';

/**
 * Flujo 1: abrir una sesion y volcar errores.
 *
 * Es el flujo que decide si el proyecto sirve: si dar de alta un error cuesta dos
 * minutos, el log se abandona en tres semanas. Por eso lo que se comprueba aqui no es
 * solo que guarde, sino que se pueda hacer del tirado con el teclado y que los defaults
 * sobrevivan de un error al siguiente.
 */

const rule = (page: Page) => page.getByRole('textbox', { name: 'Regla', exact: true });

/** Abre el drawer de sesión nueva desde Sesiones. */
async function openDrawer(page: Page) {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toBeVisible();
}

async function checkTimed(page: Page) {
  await page.getByText('Tiempo y duración').click();
  await page.getByLabel('Cronometrada').check();
}

/** Abre una sesion nueva y deja la pagina dentro de ella, lista para capturar. */
async function openSession(page: Page, reference: string, timed = false) {
  await openDrawer(page);
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('5');
  await page.getByLabel('Referencia').fill(reference);
  if (timed) await checkTimed(page);
  await page.getByRole('button', { name: 'Crear sesión' }).click();

  // Al crearla se entra en ella con la captura abierta.
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
}

test.describe('registrar una sesion y sus errores', () => {
  test('conserva la cabecera invalida y permite corregirla', async ({ page }) => {
    await openDrawer(page);

    // Mas aciertos que items: la sesion no debe abrirse.
    await page.getByLabel('Ítems intentados').fill('6');
    await page.getByLabel('Aciertos', { exact: true }).fill('9');
    await page.getByLabel('Referencia').fill('Cabecera pendiente');
    await page.getByRole('combobox', { name: 'Fuente' }).selectOption('TRAINER');
    await checkTimed(page);
    await page.getByRole('button', { name: 'Crear sesión' }).click();

    await expect(page.locator('[data-field="itemsCorrect"]')).toContainText(
      'No puedes acertar más ítems de los que intentaste',
    );
    // Y sin sesion valida no aparece la entrada de errores.
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeHidden();
    await expect(page.getByLabel('Ítems intentados')).toHaveValue('6');
    await expect(page.getByLabel('Aciertos', { exact: true })).toHaveValue('9');
    await expect(page.getByLabel('Referencia')).toHaveValue('Cabecera pendiente');
    await expect(page.getByRole('combobox', { name: 'Fuente' })).toHaveValue('TRAINER');
    await expect(page.getByLabel('Cronometrada')).toBeChecked();

    // Un segundo rechazo tampoco debe limpiar el formulario.
    await page.getByLabel('Aciertos', { exact: true }).fill('8');
    await page.getByRole('button', { name: 'Crear sesión' }).click();
    await expect(page.locator('[data-field="itemsCorrect"]')).toBeVisible();
    await expect(page.getByLabel('Aciertos', { exact: true })).toHaveValue('8');
    await page.getByLabel('Aciertos', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Crear sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
    await expect(page.getByText('5 / 6 aciertos', { exact: true })).toBeVisible();
  });

  test('abre una sesion y registra dos errores seguidos', async ({ page }) => {
    await openSession(page, 'Unidad 7, ej. 2');

    // Se entra para volcar: el cursor ya esta en el primer campo. Sin cronometro, la
    // casilla de final de sesion no significa nada y no se ofrece.
    await expect(page.getByLabel('Ítem', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Al final de la sesión')).toHaveCount(0);

    await page.getByLabel('Enunciado', { exact: true }).fill('He ______ up smoking last year. (GAVE)');
    await page.getByLabel('Corrección', { exact: true }).fill('gave up');
    await page.getByLabel('Categoría', { exact: true }).selectOption('PHRASAL_VERB');
    await rule(page).fill('give up es separable pero no con pronombre detras');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    await expect(page.getByRole('button', { name: /Ver error: gave up/ })).toBeVisible();
    await expect(page.getByText('Error guardado')).toBeVisible();

    // Segundo error: la categoria del anterior sigue puesta, que es el punto, y se dice
    // que viene heredada para que no se guarde sin mirarla.
    await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('PHRASAL_VERB');
    await expect(page.getByLabel('Categoría', { exact: true })).toHaveAccessibleDescription(/heredada/);
    await expect(page.getByLabel('Enunciado', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Corrección', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Ítem', { exact: true })).toBeFocused();

    await page.getByLabel('Enunciado', { exact: true }).fill('She ______ on her parents. (RELIES)');
    await page.getByLabel('Corrección', { exact: true }).fill('relies');
    await rule(page).fill('rely siempre lleva on, nunca in ni of');
    // Ctrl+Intro en la regla guarda sin dejar el teclado.
    await rule(page).press('Control+Enter');

    await expect(page.getByRole('button', { name: /Ver error: relies/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver error: gave up/ })).toBeVisible();
  });

  test('conserva el error rechazado y limpia solo al guardar', async ({ page }) => {
    await openSession(page, 'Unidad 8, regla copiada', true);

    await page.getByLabel('Ítem', { exact: true }).fill('4');
    await page.getByLabel('Enunciado', { exact: true }).fill('Prueba de regla copiada');
    await page.getByLabel('Tu respuesta').fill('mi intento');
    await page.getByLabel('Corrección', { exact: true }).fill('una respuesta suficientemente larga');
    await page.getByLabel('Categoría', { exact: true }).selectOption('LEXICO');
    await page.getByRole('combobox', { name: 'Causa' }).selectOption('CONFUSION');
    await page.getByRole('combobox', { name: 'Confianza' }).selectOption('SEGURO');
    await page.getByText('Más detalles').click();
    await page.getByLabel('Subcategoría').fill('contraste');
    await page.getByLabel('Al final de la sesión').check();
    await rule(page).fill('una respuesta suficientemente larga');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();

    // Se apunta al error del campo: el anunciador de rutas de Next tambien es role=alert.
    await expect(page.locator('[data-field="ruleNote"]')).toContainText(
      'no puede ser la respuesta correcta',
    );
    await expect(page.getByLabel('Ítem', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('Enunciado', { exact: true })).toHaveValue('Prueba de regla copiada');
    await expect(page.getByLabel('Tu respuesta')).toHaveValue('mi intento');
    await expect(page.getByLabel('Corrección', { exact: true })).toHaveValue('una respuesta suficientemente larga');
    await expect(rule(page)).toHaveValue('una respuesta suficientemente larga');
    await expect(page.getByLabel('Al final de la sesión')).toBeChecked();

    const text = 'Regla corregida con una explicacion distinta de la respuesta';
    await rule(page).fill(text);
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByRole('button', { name: /Ver error 4: una respuesta suficientemente larga/ })).toBeVisible();
    await expect(page.getByLabel('Enunciado', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Corrección', { exact: true })).toHaveValue('');
    await expect(rule(page)).toHaveValue('');
    await expect(page.getByLabel('Al final de la sesión')).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Causa' })).toHaveValue('CONFUSION');
    await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('LEXICO');
    await expect(page.getByLabel('Subcategoría')).toHaveValue('contraste');
    await expect(page.getByRole('combobox', { name: 'Confianza' })).toHaveValue('SEGURO');
    await expect(page.getByLabel('Ítem', { exact: true })).toBeFocused();

    // La regla guardada se lee en el detalle, sin entrar a editar.
    await page.getByRole('button', { name: /Ver error 4/ }).click();
    await expect(page.getByRole('complementary', { name: 'Detalle del error' })).toContainText(text);
  });

  test('ir a pegar una tanda y volver no se lleva el formulario', async ({ page }) => {
    await openSession(page, 'Unidad 9, variantes');

    await page.getByLabel('Enunciado', { exact: true }).fill('texto que debe sobrevivir');

    await page.getByRole('button', { name: 'Pegar varios' }).click();
    await expect(page.getByRole('heading', { name: 'Pegar errores en esta sesión' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: 'Añadir error' }).click();
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
    await expect(page.getByLabel('Enunciado', { exact: true })).toHaveValue('texto que debe sobrevivir');
  });

  test('conserva el borrador y explica que otra pestaña ha cerrado la sesion', async ({ page }) => {
    await openSession(page, 'Sesion cerrada en otra pestaña');
    await page.getByLabel('Enunciado', { exact: true }).fill('Enunciado pendiente de guardar');
    await page.getByLabel('Corrección', { exact: true }).fill('given up');
    await page.getByLabel('Categoría', { exact: true }).selectOption('PHRASAL_VERB');
    await rule(page).fill('give up expresa abandonar una actividad');

    const other = await page.context().newPage();
    try {
      await other.goto(page.url());
      await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
      await expect(other.getByRole('button', { name: 'Reabrir para añadir', exact: true })).toBeVisible();
    } finally {
      await other.close();
    }

    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'La sesión está cerrada.' })).toBeVisible();
    await expect(page.getByLabel('Enunciado', { exact: true })).toHaveValue('Enunciado pendiente de guardar');
    await expect(page.getByLabel('Corrección', { exact: true })).toHaveValue('given up');
  });
});
