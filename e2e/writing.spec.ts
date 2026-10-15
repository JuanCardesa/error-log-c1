import { type Page, expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { writingPiece } from '../src/lib/db/schema';
import { E2E_DB } from './globalSetup';

/** Sin `updatedAt`: guardar siempre lo cambia, y aquí se comprueba que no cambie nada más. */
function readPieces() {
  const db = createDb(E2E_DB);
  try {
    return db.select().from(writingPiece).orderBy(writingPiece.id).all()
      .map(({ updatedAt: _updatedAt, ...piece }) => piece);
  } finally {
    db.$client.close();
  }
}

const drawer = (page: Page) => page.getByRole('complementary', { name: /Writing$/ });

async function openDetails(page: Page, summary: string) {
  const details = drawer(page).locator('details').filter({ hasText: summary });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}

/** El original del seed y su reescritura: textos antiguos, sin transcripción ni título propio. */
function seedPair() {
  const pieces = readPieces();
  const rewrite = pieces.find((piece) => piece.rewriteOf !== null);
  const original = pieces.find((piece) => piece.id === rewrite?.rewriteOf);
  if (rewrite === undefined || original === undefined) {
    throw new Error('El seed debe incluir un original y su reescritura');
  }
  return { pieces, original, rewrite };
}

test('el enlace antiguo ?edit abre los datos en el lector y un ciclo se rechaza sin perder cambios', async ({ page }) => {
  const { pieces: before, original, rewrite } = seedPair();

  await page.goto(`/writing?edit=${String(original.id)}`);
  await expect(page).toHaveURL(`/writing/${String(original.id)}?editar=1`);
  await expect(page.getByRole('heading', { name: 'Editar Writing' })).toBeVisible();
  await openDetails(page, 'Palabras y duración');
  await openDetails(page, 'Añadir evaluación');
  await drawer(page).getByLabel('Palabras', { exact: true }).fill('299');
  await drawer(page).getByRole('combobox', { name: 'Género', exact: true }).selectOption('REVIEW');
  await drawer(page).getByRole('combobox', { name: 'Corrector', exact: true }).selectOption('IA');
  await drawer(page).getByLabel('Cronometrado', { exact: true }).uncheck();
  await drawer(page).getByLabel('Language', { exact: true }).fill('4');
  await drawer(page).getByLabel('Es una reescritura').check();
  await drawer(page).getByRole('combobox', { name: 'Texto original' }).selectOption(String(rewrite.id));
  await drawer(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(drawer(page).getByText('Ese enlace crearía un ciclo de reescrituras', { exact: true })).toBeVisible();
  await expect(drawer(page).getByLabel('Palabras', { exact: true })).toHaveValue('299');
  await expect(drawer(page).getByRole('combobox', { name: 'Género', exact: true })).toHaveValue('REVIEW');
  await expect(drawer(page).getByRole('combobox', { name: 'Corrector', exact: true })).toHaveValue('IA');
  await expect(drawer(page).getByLabel('Cronometrado', { exact: true })).not.toBeChecked();
  await expect(drawer(page).getByLabel('Language', { exact: true })).toHaveValue('4');
  await expect(drawer(page).getByRole('combobox', { name: 'Texto original' })).toHaveValue(String(rewrite.id));
  expect(readPieces()).toEqual(before);

  await drawer(page).getByLabel('Es una reescritura').uncheck();
  await drawer(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Writing actualizado' })).toBeVisible();
  // Cerrado el drawer, la URL deja de abrirlo al recargar.
  await expect(page).toHaveURL(`/writing/${String(original.id)}`);
  expect(readPieces().find((piece) => piece.id === original.id)).toEqual({
    ...original, wordCount: 299, genre: 'REVIEW', corrector: 'IA', timed: false, bandLanguage: 4,
  });
});

test('desde la biblioteca se edita un texto con sus datos y se conserva su reescritura', async ({ page }) => {
  const { pieces: before, original, rewrite } = seedPair();

  await page.goto('/writing');
  await page.locator(`a[href="/writing/${String(rewrite.id)}"]`).click();
  await expect(page).toHaveURL(`/writing/${String(rewrite.id)}`);
  await page.getByRole('button', { name: 'Editar datos' }).click();
  await expect(page.getByRole('heading', { name: 'Editar Writing' })).toBeVisible();
  await openDetails(page, 'Palabras y duración');
  await expect(drawer(page).getByLabel('Palabras', { exact: true })).toHaveValue(String(rewrite.wordCount));
  await expect(drawer(page).getByLabel('Minutos', { exact: true })).toHaveValue(String(rewrite.minutes));
  await expect(drawer(page).getByRole('combobox', { name: 'Género', exact: true })).toHaveValue(rewrite.genre);
  await expect(drawer(page).getByLabel('Es una reescritura')).toBeChecked();
  await expect(drawer(page).getByRole('combobox', { name: 'Texto original' })).toHaveValue(String(original.id));

  await drawer(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Writing actualizado' })).toBeVisible();
  expect(readPieces()).toEqual(before);

  // En sentido inverso no se arrastra la relación del texto anterior.
  await page.getByRole('article').getByRole('link', { name: 'Essay: urban transport', exact: true }).click();
  await expect(page).toHaveURL(`/writing/${String(original.id)}`);
  await page.getByRole('button', { name: 'Editar datos' }).click();
  await expect(drawer(page).getByLabel('Es una reescritura')).not.toBeChecked();
  await expect(drawer(page).getByRole('combobox', { name: 'Texto original' })).toHaveCount(0);
  await drawer(page).getByRole('button', { name: 'Cancelar' }).click();
  expect(readPieces()).toEqual(before);
});

test('una sesión Writing creada desde Sesiones vuelve a la importación, enlazada', async ({ page }) => {
  await page.goto('/registrar?nueva=writing');
  await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tipo', exact: true })).toHaveValue('WRITING');
  await expect(page.getByRole('combobox', { name: 'Formato de examen' })).toHaveValue('WRITING');
  await page.getByRole('button', { name: 'Crear sesión' }).click();

  await expect(page).toHaveURL(/\/writing\/importar\?sesion=\d+$/);
  await expect(page.getByText(/^Se enlazará con la sesión de Writing «/)).toBeVisible();
});

test('los enlaces anteriores para registrar Writing llevan a la importación', async ({ page }) => {
  await page.goto('/writing?registrar=1&sesion=12');
  await expect(page).toHaveURL('/writing/importar?sesion=12');
  await page.goto('/writing?registrar=1');
  await expect(page).toHaveURL('/writing/importar');
  await page.goto('/writing?edit=999999');
  await expect(page.getByRole('status').filter({ hasText: 'No encontramos ese registro de Writing' })).toBeVisible();
  await page.goto('/writing/999999-no-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Esta página no existe' })).toBeVisible();
});
