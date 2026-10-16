import { expect, test } from '@playwright/test';

/**
 * La entrada de Sesiones: pegar una tanda es lo primero; la sesión manual va
 * a un clic (o la tecla N) en un drawer, y la revisión de una tanda sustituye la vista.
 */

const session = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: 'Entrada de Registrar', itemsTotal: 8, itemsCorrect: 6, timed: false };
const row = { prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };

test('la sesión manual se abre en un drawer y Escape la cierra sin perder lo escrito', async ({ page }) => {
  await page.goto('/registrar');
  await expect(page.getByLabel('Ítems intentados')).toBeHidden();

  // Hasta hidratar no hay atajo: se repite la tecla hasta que el drawer se abre.
  await expect(async () => {
    await page.keyboard.press('n');
    await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByLabel('Referencia').fill('Escrito antes de cerrar');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Nueva sesión manual/ })).toBeFocused();

  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await expect(page.getByLabel('Referencia')).toHaveValue('Escrito antes de cerrar');
});

test('detecta el formato al pegar y la revisión sustituye la entrada', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByLabel('Pegar correcciones').fill(JSON.stringify({ session, errors: [row] }));
  await expect(page.getByText('Detectado: sesión + 1 error')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar importación' }).click();

  await expect(page.getByRole('heading', { name: 'Revisar importación', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nueva sesión manual/ })).toBeHidden();
  await expect(page.getByRole('table', { name: 'Sesiones' })).toBeHidden();

  // Volver sin cambios devuelve el texto pegado intacto.
  await page.getByRole('button', { name: 'Volver al texto pegado' }).click();
  await expect(page.getByLabel('Pegar correcciones')).toHaveValue(JSON.stringify({ session, errors: [row] }));
});

test('un texto que no se entiende se explica sin perderlo', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByLabel('Pegar correcciones').fill('texto libre sin formato');
  await page.getByRole('button', { name: 'Revisar importación' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'instrucciones para la IA' })).toBeVisible();
  await expect(page.getByLabel('Pegar correcciones')).toHaveValue('texto libre sin formato');
});

test('un dato que no vale se explica con su nombre y su línea, y lleva a ella', async ({ page }) => {
  await page.goto('/registrar');
  const field = page.getByLabel('Pegar correcciones');
  await field.fill(JSON.stringify({ session: { ...session, kind: 'DRIL' }, errors: [row] }, null, 2));
  await page.getByRole('button', { name: 'Revisar importación' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Hay un dato que no vale en la tanda' });
  await expect(alert).toContainText('Tipo "DRIL" no es un valor admitido: usa DRILL, PARCIAL, SIMULACRO, CLASE o WRITING.');
  // La detección no repite el aviso debajo del campo.
  await expect(page.getByText('Hay un dato que no vale en la tanda')).toHaveCount(1);

  await alert.getByRole('button', { name: 'Seleccionar la línea 4 del texto pegado' }).click();
  await expect(field).toBeFocused();
  expect(await field.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd)))
    .toBe('    "kind": "DRIL",');
});

test('Ctrl+K abre la búsqueda y lleva a un error concreto', async ({ page }) => {
  await page.goto('/registrar');
  const search = page.getByRole('combobox', { name: 'Buscar' });
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(search).toBeFocused({ timeout: 1000 });
  }).toPass();
  await search.fill('Ir a Progreso');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/informe/);
});
