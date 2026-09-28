import { expect, test, type Page } from '@playwright/test';

/**
 * Pegar varios errores en una sesión abierta y revisarlos: índice con el estado de cada
 * uno, un solo editor para el elegido y una barra que no deja guardar con pendientes.
 */

async function openImport(page: Page) {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('5');
  await page.getByLabel('Referencia').fill('Importacion de correcciones');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
  await page.getByRole('button', { name: 'Pegar varios' }).click();
}

async function review(page: Page, text: string) {
  await page.getByLabel('Errores para añadir a esta sesión').fill(text);
  await page.getByRole('button', { name: 'Revisar importación' }).click();
  await expect(workspace(page)).toBeVisible();
}

const workspace = (page: Page) => page.getByRole('region', { name: 'Revisar importación' });
const correct = (page: Page) => workspace(page).getByRole('textbox', { name: 'Corrección', exact: true });
const ruleBox = (page: Page) => workspace(page).getByRole('textbox', { name: 'Regla', exact: true });
const save = (page: Page, n: number) =>
  workspace(page).getByRole('button', { name: new RegExp(`^Guardar ${String(n)} error(?:es)? en esta sesión`) });
const nextPending = (page: Page) => workspace(page).getByRole('button', { name: /^Siguiente pendiente/ });
const indexRow = (page: Page, n: number) =>
  workspace(page).getByRole('list', { name: 'Errores de la tanda' }).getByRole('button', { name: new RegExp(`^${String(n)}\\b`) });
const sessionErrors = (page: Page) => page.getByRole('button', { name: /^Ver error/ });

const rows = [
  { itemRef: '4', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' },
  { itemRef: '5', prompt: 'She is interested ___ music.', myAnswer: 'on', correctAnswer: 'in', category: 'PREPOSICION_DEPENDIENTE', ruleNote: 'Interested se construye con la preposicion in.' },
];

test('cuenta los errores pendientes y no envia hasta completarlos', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify([rows[0], { ...rows[1], correctAnswer: '' }]));
  await expect(workspace(page).getByRole('heading', { name: 'Revisar importación' })).toBeFocused();
  await expect(workspace(page).getByText('1 por completar · no se guarda nada hasta completarlos')).toBeVisible();
  await expect(indexRow(page, 2)).toContainText('Falta');
  await expect(indexRow(page, 1)).toContainText('Listo');

  // Guardar con pendientes lleva al que falta y no envía nada (el botón es aria-disabled pero alcanzable).
  await save(page, 2).click({ force: true });
  await expect(correct(page)).toBeFocused();
  await expect(workspace(page).getByRole('heading', { name: 'Error 2 de 2' })).toBeVisible();
  await expect(sessionErrors(page)).toHaveCount(0);

  await correct(page).fill('in');
  await expect(workspace(page).getByText('2 errores listos para enviar')).toBeVisible();
  await save(page, 2).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
  await expect(sessionErrors(page)).toHaveCount(2);
});

test('Alt+↓ recorre los pendientes en orden y enfoca lo que falta', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify([
    { ...rows[0], correctAnswer: '' },
    rows[1],
    { ...rows[0], itemRef: '9', prompt: '' },
  ]));
  await page.keyboard.press('Alt+ArrowDown');
  await expect(workspace(page).getByRole('heading', { name: 'Error 3 de 3' })).toBeVisible();
  // Sin enunciado, se abre «Más detalles» y el foco va a ese campo.
  await expect(workspace(page).getByRole('textbox', { name: 'Enunciado', exact: true })).toBeFocused();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(workspace(page).getByRole('heading', { name: 'Error 1 de 3' })).toBeVisible();
  await expect(correct(page)).toBeFocused();
  await nextPending(page).click();
  await expect(workspace(page).getByRole('heading', { name: 'Error 3 de 3' })).toBeVisible();
});

test('quitar una fila se puede deshacer y no desplaza la selección', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify([...rows, rows[0]]));
  await expect(workspace(page).getByText('3 errores listos para enviar')).toBeVisible();

  await indexRow(page, 3).click();
  await workspace(page).getByRole('button', { name: 'Quitar error 3 de la tanda' }).click();
  await expect(workspace(page).getByText('2 errores listos para enviar')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(workspace(page).getByText('3 errores listos para enviar')).toBeVisible();
  await expect(workspace(page).getByRole('heading', { name: 'Error 3 de 3' })).toBeVisible();

  // Alt+Supr quita la fila elegida también desde el teclado.
  await page.keyboard.press('Alt+Delete');
  await expect(workspace(page).getByText('2 errores listos para enviar')).toBeVisible();
});

test('la revision cabe en movil y pone los campos en una columna', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImport(page);
  await review(page, JSON.stringify([{ ...rows[0], correctAnswer: '', category: '', ruleNote: '' }, rows[1]]));
  await expect(workspace(page).getByRole('combobox', { name: 'Error de la tanda' })).toBeVisible();
  await expect(workspace(page).getByRole('list', { name: 'Errores de la tanda' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box = await correct(page).boundingBox();
  const cause = await workspace(page).getByRole('combobox', { name: 'Causa' }).boundingBox();
  expect(box).not.toBeNull();
  expect(cause).not.toBeNull();
  expect(cause!.y).toBeGreaterThan(box!.y + box!.height);
});

test('elige la categoria escribiendo y la fila pasa a lista al momento', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify([{ ...rows[0], category: '' }]));
  await expect(indexRow(page, 1)).toContainText('Falta');

  const category = workspace(page).getByRole('combobox', { name: 'Categoría' });
  await category.click();
  await category.fill('phra');
  await expect(workspace(page).getByRole('option', { name: /Phrasal verb/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(category).toHaveValue('Phrasal verb');
  await expect(indexRow(page, 1)).toContainText('Listo');

  const cause = workspace(page).getByRole('combobox', { name: 'Causa' });
  await cause.selectOption('CONFUSION');
  await expect(workspace(page).getByText('Generará una tarjeta pendiente en Anki.', { exact: false })).toBeVisible();
});

test('volver al texto con cambios pide confirmacion en la pagina, no con un dialogo nativo', async ({ page }) => {
  page.on('dialog', () => { throw new Error('dialogo nativo inesperado'); });
  await openImport(page);
  const original = JSON.stringify(rows);
  await review(page, original);
  await workspace(page).getByRole('button', { name: 'Volver al texto pegado' }).click();
  await expect(page.getByLabel('Errores para añadir a esta sesión')).toHaveValue(original);

  await page.getByRole('button', { name: 'Revisar importación' }).click();
  await correct(page).fill('away');
  await workspace(page).getByRole('button', { name: 'Volver al texto pegado' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Descartar la revisión' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(correct(page)).toHaveValue('away');

  await workspace(page).getByRole('button', { name: 'Volver al texto pegado' }).click();
  await dialog.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(page.getByLabel('Errores para añadir a esta sesión')).toHaveValue(original);
});

test('guarda la tanda sin duplicarla al repetirla y copia las instrucciones para la IA', async ({ page, context }) => {
  await openImport(page);
  await page.getByText('Preparar correcciones con IA').click();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar instrucciones para la IA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Instrucciones copiadas' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('QUE NO DEBES INVENTAR');

  await review(page, JSON.stringify(rows));
  await workspace(page).getByRole('combobox', { name: 'Causa' }).selectOption('CONFUSION');
  await workspace(page).getByRole('combobox', { name: 'Confianza' }).selectOption('SEGURO');
  // Ctrl+Intro guarda desde el teclado, también dentro de un campo.
  await ruleBox(page).press('Control+Enter');
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
  await expect(sessionErrors(page)).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Errores registrados en esta sesión' })).toContainText('Confusión');

  await page.getByRole('button', { name: 'Pegar varios' }).click();
  await review(page, JSON.stringify(rows));
  await save(page, 2).click();
  await expect(page.getByRole('status').filter({ hasText: '0 errores guardados. 2 repetidos omitidos' })).toBeVisible();
  await page.reload();
  await expect(sessionErrors(page)).toHaveCount(2);

  // Sin contexto seguro no hay API de portapapeles: queda el Ctrl+C sobre el texto marcado.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Pegar varios' }).click();
  await page.getByText('Preparar correcciones con IA').click();
  await page.getByRole('button', { name: 'Copiar instrucciones para la IA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'pulsa Ctrl+C' })).toBeVisible();
  await expect(page.getByLabel('Instrucciones para la IA')).toBeFocused();
});

test('un error invalido bloquea toda la tanda y el mensaje sigue a su fila al quitar otra', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify([
    rows[0], { ...rows[1], correctAnswer: 'una respuesta copiada como regla', ruleNote: 'una respuesta copiada como regla' },
    { itemRef: '6', prompt: 'He gave ___ smoking.', myAnswer: 'out', correctAnswer: 'up', category: 'PHRASAL_VERB', ruleNote: 'Give up significa abandonar un habito.' },
  ]));
  await save(page, 3).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha guardado ningún error' })).toBeVisible();
  await expect(sessionErrors(page)).toHaveCount(0);
  // Se selecciona la fila rechazada, con su mensaje.
  await expect(workspace(page).getByRole('heading', { name: 'Error 2 de 3' })).toBeVisible();
  await expect(workspace(page).locator('[data-field="ruleNote"]')).toContainText('no puede ser la respuesta correcta');
  await expect(indexRow(page, 2)).toContainText('Revisar');

  // Quitar una fila anterior no desplaza el mensaje al error de al lado.
  await indexRow(page, 1).click();
  await workspace(page).getByRole('button', { name: 'Quitar error 1 de la tanda' }).click();
  await expect(workspace(page).getByRole('heading', { name: 'Error 1 de 2' })).toBeVisible();
  await expect(workspace(page).locator('[data-field="ruleNote"]')).toContainText('no puede ser la respuesta correcta');
  await indexRow(page, 2).click();
  await expect(workspace(page).locator('[data-field="ruleNote"]')).toHaveCount(0);

  await indexRow(page, 1).click();
  await correct(page).fill('in');
  await ruleBox(page).fill('Interested siempre se construye con in.');
  await save(page, 2).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
});

test('pega una tabla y conserva la tanda si otra pestaña cierra la sesion', async ({ page }) => {
  await openImport(page);
  await review(page, 'Item\tEnunciado\tMi respuesta\tCorrecta\tCategoria\tRegla\n4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar una actividad.');
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Reabrir para añadir', exact: true })).toBeVisible();
    await save(page, 1).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ya no está abierta' })).toBeVisible();
    await expect(correct(page)).toHaveValue('off');
    await other.getByRole('button', { name: 'Reabrir para añadir', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
    await save(page, 1).click();
    await expect(page.getByRole('status').filter({ hasText: '1 error guardado.' })).toBeVisible();
  } finally { await other.close(); }
});

test('si no llega la respuesta del guardado, lo dice sin prometer que no se guardó y conserva la tanda', async ({ page }) => {
  await openImport(page);
  await review(page, JSON.stringify(rows));
  // Se corta la petición de la acción de servidor: la red falla después de enviar.
  await page.route('**/registrar**', (route) => (
    route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue()
  ));
  await save(page, 2).click();
  const alert = page.getByRole('alert').filter({ hasText: 'No pudimos confirmar el guardado' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Tu borrador se conserva');
  await expect(alert).not.toContainText('no se ha guardado nada');
  await expect(correct(page)).toHaveValue('off');

  // El borrador queda en el navegador: al volver a la sesión se ofrece recuperarlo.
  await page.unroute('**/registrar**');
  await page.reload();
  await expect(page.getByText('Tanda sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Pegar varios' }).click();
  await page.getByRole('button', { name: 'Recuperar' }).click();
  await expect(workspace(page)).toBeVisible();
  await expect(correct(page)).toHaveValue('off');
  await save(page, 2).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
  await expect(page.getByText('Tanda sin guardar')).toHaveCount(0);
});
