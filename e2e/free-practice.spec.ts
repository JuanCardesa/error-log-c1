import { type Page, expect, test } from '@playwright/test';

const paper = (page: Page) => page.getByRole('combobox', { name: 'Formato de examen' });
const part = (page: Page) => page.getByRole('combobox', { name: 'Part', exact: true });

async function editSession(page: Page) {
  await page.getByRole('button', { name: 'Más acciones de la sesión' }).click();
  await page.getByRole('menuitem', { name: 'Editar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Editar sesión' })).toBeVisible();
}

// El dato de la cabecera, no la opción homónima del drawer de edición (montado y oculto).
const practice = (page: Page, text: string) => page.locator('span', { hasText: new RegExp(`^${text}$`) });

test('registra practica libre, conserva la edicion y permite cambiar de formato', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await part(page).selectOption('8');
  await paper(page).selectOption('');
  await expect(part(page)).toHaveCount(0);
  await page.getByLabel('Referencia').fill('Libro, unidad 4, ejercicio libre');
  await page.getByLabel('Ítems intentados').fill('10');
  await page.getByLabel('Aciertos', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.locator('[data-field="itemsCorrect"]')).toBeVisible();
  await expect(paper(page)).toHaveValue('');
  await page.getByLabel('Aciertos', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Libro, unidad 4, ejercicio libre');
  await expect(practice(page, 'Sin formato de examen')).toBeVisible();
  const sessionUrl = new URL(page.url());

  await page.getByLabel('Enunciado', { exact: true }).fill('She is interested ___ science.');
  await page.getByLabel('Corrección', { exact: true }).fill('in');
  await page.getByLabel('Categoría', { exact: true }).selectOption('PREPOSICION_DEPENDIENTE');
  await page.getByRole('textbox', { name: 'Regla', exact: true }).fill('Interested se construye con la preposicion in.');
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();
  await expect(page.getByRole('button', { name: 'Ver error: in' })).toBeVisible();

  await editSession(page);
  await expect(paper(page)).toHaveValue('');
  await expect(part(page)).toHaveCount(0);
  await page.getByLabel('Referencia').fill('Libro, unidad 4, referencia corregida');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Libro, unidad 4, referencia corregida');
  await page.reload();
  await expect(practice(page, 'Sin formato de examen')).toBeVisible();

  await editSession(page);
  await paper(page).selectOption('LISTENING');
  await expect(part(page)).toHaveValue('1');
  await part(page).selectOption('4');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(practice(page, 'Listening · Part 4')).toBeVisible();
  await editSession(page);
  await paper(page).selectOption('');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(practice(page, 'Sin formato de examen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver error: in' })).toBeVisible();

  // En el historial la práctica se lee como tal, sin inventar una part.
  await page.goto('/registrar');
  const row = page.getByRole('row').filter({ has: page.locator(`a[href="${sessionUrl.pathname}?s=${String(sessionUrl.searchParams.get('s'))}"]`) });
  await expect(row).toContainText('Sin formato de examen');
  await expect(row).not.toContainText('Part');
});

test('elegir tipo Writing exige su paper y muestra una part valida', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await paper(page).selectOption('');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('WRITING');
  await expect(paper(page)).toHaveValue('WRITING');
  await expect(part(page)).toHaveValue('1');
  await expect(page.locator('select[name="paper"] option[value=""]')).toHaveJSProperty('disabled', true);
  // Writing no registra ítems ni aciertos: sus campos no se ofrecen.
  await expect(page.getByLabel('Ítems intentados')).toHaveCount(0);
  await expect(page.getByText('Writing no registra ítems ni aciertos.', { exact: false })).toBeVisible();
});
