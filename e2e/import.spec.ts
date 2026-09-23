import { expect, test, type Page } from '@playwright/test';

async function openImport(page: Page) {
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'Nueva sesión a mano' }).click();
  await page.getByLabel('Ítems *').fill('8');
  await page.getByLabel('Aciertos *').fill('5');
  await page.getByLabel('Referencia').fill('Importacion de correcciones');
  await page.getByRole('button', { name: 'Abrir sesión' }).click();
  await page.getByRole('button', { name: 'Pegar varios errores', exact: true }).click();
}

const rows = [
  { itemRef: '4', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' },
  { itemRef: '5', prompt: 'She is interested ___ music.', myAnswer: 'on', correctAnswer: 'in', category: 'PREPOSICION_DEPENDIENTE', ruleNote: 'Interested se construye con la preposicion in.' },
];

test('cuenta los errores pendientes y no envia hasta completarlos', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify([rows[0], { ...rows[1], correctAnswer: '' }]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar 2 errores' })).toBeFocused();
  await expect(page.getByText('Faltan 1 de 2 por completar.', { exact: true })).toBeVisible();
  const second = page.getByRole('group', { name: 'Error 2', exact: true });
  await expect(second.getByText('Falta: correcta', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Errores registrados en esta sesión' })).toHaveCount(0);
  await expect(second.getByLabel('Correcta *')).toBeFocused();
  await expect(page.getByText('Completa los errores pendientes antes de guardar. Faltan 1 de 2.')).toBeVisible();
  await second.getByLabel('Correcta *').fill('in');
  await expect(page.getByText('Los 2 errores están completos.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeFocused();
});

test('pulsar Ir al siguiente pendiente abre y enfoca lo que falta', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify([{ ...rows[0], prompt: '' }]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await page.getByRole('button', { name: 'Ir al siguiente pendiente' }).click();
  const prompt = page.getByRole('group', { name: 'Error 1', exact: true }).getByLabel('Enunciado *');
  await expect(prompt).toBeVisible();
  await expect(prompt).toBeFocused();
});

test('recorre los pendientes en orden y conserva el resumen y el foco al quitar filas', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify(rows.map((row) => ({ ...row, correctAnswer: '' }))));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  const first = page.getByRole('group', { name: 'Error 1', exact: true });
  const second = page.getByRole('group', { name: 'Error 2', exact: true });
  const next = page.getByRole('button', { name: 'Ir al siguiente pendiente' });
  await next.click();
  await expect(first.getByLabel('Correcta *')).toBeFocused();
  await next.click();
  await expect(second.getByLabel('Correcta *')).toBeFocused();
  await next.click();
  await expect(first.getByLabel('Correcta *')).toBeFocused();
  await second.getByText('Ítem, enunciado, tu respuesta y subcategoría', { exact: true }).click();
  await second.getByLabel('Enunciado *').fill('She is interested ___ art.');
  await expect(second.locator('p').filter({ hasText: 'She is interested ___ art.' })).toBeVisible();
  await first.getByRole('button', { name: 'Quitar error 1 de la tanda' }).click();
  await expect(first.getByLabel('Correcta *')).toBeFocused();
  await expect(page.getByText('Faltan 1 de 1 por completar.', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Quitar error 1 de la tanda' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar 0 errores' })).toBeFocused();
});

test('la revision cabe en movil y mantiene los campos principales visibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify([{ ...rows[0], correctAnswer: '', category: '', ruleNote: '' }]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  const first = page.getByRole('group', { name: 'Error 1', exact: true });
  await expect(first.getByRole('combobox', { name: /^Causa/ })).toBeVisible();
  await expect(first.getByRole('combobox', { name: 'Confianza', exact: true })).toBeVisible();
  await expect(first.getByLabel('Enunciado *')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const correct = await first.getByLabel('Correcta *').boundingBox();
  const cause = await first.getByRole('combobox', { name: /^Causa/ }).boundingBox();
  expect(correct).not.toBeNull();
  expect(cause).not.toBeNull();
  expect(cause!.y).toBeGreaterThan(correct!.y + correct!.height);
});

test('permite elegir categoria con el teclado y actualiza los pendientes', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify([{ ...rows[0], category: '' }]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await page.getByRole('button', { name: 'Ir al siguiente pendiente' }).click();
  const category = page.getByRole('group', { name: 'Error 1', exact: true }).getByLabel('Categoría *');
  await expect(category).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(category).toHaveValue('COLOCACION');
  await expect(page.getByText('El error está completo.', { exact: true })).toBeVisible();
});

test('volver al texto pide confirmacion en la pagina, no con un dialogo', async ({ page }) => {
  page.on('dialog', () => { throw new Error('dialogo nativo inesperado'); });
  await openImport(page);
  const original = JSON.stringify(rows);
  const paste = page.getByLabel('Errores para importar');
  const preview = page.getByRole('button', { name: 'Preparar vista previa' });
  const back = page.getByRole('button', { name: 'Volver al texto pegado' });
  await paste.fill(original);
  await preview.click();
  await expect(page.getByText('Convertir mis correcciones con IA', { exact: true })).toHaveCount(0);
  await back.click();
  await expect(paste).toHaveValue(original);
  await preview.click();
  const correct = page.getByRole('group', { name: 'Error 1', exact: true }).getByLabel('Correcta *');
  await correct.fill('away');
  await back.click();
  await expect(page.getByRole('button', { name: 'Descartar y volver' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seguir revisando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(back).toBeFocused();
  await expect(correct).toHaveValue('away');
  await back.click();
  await page.getByRole('button', { name: 'Descartar y volver' }).click();
  await expect(paste).toHaveValue(original);
});

test('pega, revisa, quita una fila y guarda la tanda sin duplicarla al repetirla', async ({ page, context }) => {
  await openImport(page);
  await page.getByText('Convertir mis correcciones con IA', { exact: true }).click();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar instrucciones para la IA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Instrucciones copiadas' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('QUE NO DEBES INVENTAR');

  await page.getByLabel('Errores para importar').fill(JSON.stringify([...rows, rows[0]]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar 3 errores' })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar error 3 de la tanda' }).click();
  const first = page.getByRole('group', { name: 'Error 1', exact: true });
  await first.getByRole('combobox', { name: /^Causa/ }).selectOption('CONFUSION');
  await first.getByRole('combobox', { name: 'Confianza', exact: true }).selectOption('SEGURO');
  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Errores registrados en esta sesión' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.getByRole('cell', { name: 'Confusión', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Seguro', exact: true })).toBeVisible();
  await expect(page.getByLabel('Errores para importar')).toHaveValue('');

  await page.getByLabel('Errores para importar').fill(JSON.stringify(rows));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '0 errores guardados. 2 repetidos omitidos' })).toBeVisible();
  await page.reload();
  await expect(table.locator('tbody tr')).toHaveCount(2);

  // Sin contexto seguro no hay API de portapapeles: queda el Ctrl+C sobre el texto marcado.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Pegar varios errores', exact: true }).click();
  await page.getByText('Convertir mis correcciones con IA', { exact: true }).click();
  await page.getByRole('button', { name: 'Copiar instrucciones para la IA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'pulsa Ctrl+C' })).toBeVisible();
  await expect(page.getByLabel('Instrucciones para la IA')).toBeFocused();
});

test('un error invalido bloquea toda la tanda y se puede corregir sin perder los demas', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill(JSON.stringify([
    rows[0], { ...rows[1], correctAnswer: 'una respuesta copiada como regla', ruleNote: 'una respuesta copiada como regla' },
    { itemRef: '6', prompt: 'He gave ___ smoking.', myAnswer: 'out', correctAnswer: 'up', category: 'PHRASAL_VERB', ruleNote: 'Give up significa abandonar un habito.' },
  ]));
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  await page.getByRole('button', { name: 'Guardar 3 errores', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha guardado ningun error' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Errores registrados en esta sesión' })).toHaveCount(0);
  const first = page.getByRole('group', { name: 'Error 1', exact: true });
  const second = page.getByRole('group', { name: 'Error 2', exact: true });
  await expect(first.getByLabel('Correcta *')).toHaveValue('off');
  await expect(second.locator('[data-field="ruleNote"]')).toContainText('no puede ser la respuesta correcta');

  // Quitar una fila anterior no puede desplazar el mensaje al error de al lado.
  await page.getByRole('button', { name: 'Quitar error 1 de la tanda' }).click();
  await expect(first.locator('[data-field="ruleNote"]')).toContainText('no puede ser la respuesta correcta');
  await expect(second.locator('[data-field="ruleNote"]')).toHaveCount(0);
  await first.getByLabel('Correcta *').fill('in');
  await first.getByLabel('Regla, con tus palabras *').fill('Interested siempre se construye con in.');
  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
});

test('pega una tabla y conserva la tanda si otra pestaña cierra la sesion', async ({ page }) => {
  await openImport(page);
  await page.getByLabel('Errores para importar').fill('Item\tEnunciado\tMi respuesta\tCorrecta\tCategoria\tRegla\n4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar una actividad.');
  await page.getByRole('button', { name: 'Preparar vista previa' }).click();
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Reabrir sesión', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar 1 error', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ya no esta abierta' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Error 1', exact: true }).getByLabel('Correcta *')).toHaveValue('off');
    await other.getByRole('button', { name: 'Reabrir sesión', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar 1 error', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '1 error guardado.' })).toBeVisible();
  } finally { await other.close(); }
});
