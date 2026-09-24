import { type Page, expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { listWritingPieces } from '../src/lib/db/repo';
import { E2E_DB } from './globalSetup';

function readPieces() {
  const db = createDb(E2E_DB);
  try {
    return listWritingPieces(db);
  } finally {
    db.$client.close();
  }
}

const drawer = (page: Page) => page.getByRole('complementary', { name: /Writing$/ });

async function createWritingSession(page: Page) {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/ }).click();
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('WRITING');
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page).toHaveURL(/s=\d+/);
  const id = new URL(page.url()).searchParams.get('s');
  if (id === null) throw new Error('Falta la sesion recien creada');
  return id;
}

async function openNew(page: Page) {
  await page.goto('/writing');
  await page.getByRole('button', { name: 'Registrar Writing' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar Writing' })).toBeVisible();
}

async function openDetails(page: Page, summary: string) {
  const details = drawer(page).locator('details').filter({ hasText: summary });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}

test('conserva Writing cuando otra pestaña ocupa la sesion', async ({ page, context }) => {
  const sessionId = await createWritingSession(page);
  await openNew(page);
  await drawer(page).getByRole('combobox', { name: 'Sesión Writing libre' }).selectOption(sessionId);
  await openDetails(page, 'Palabras y duración');
  await drawer(page).getByLabel('Palabras', { exact: true }).fill('271');
  const other = await context.newPage();
  try {
    await openNew(other);
    await drawer(other).getByRole('combobox', { name: 'Sesión Writing libre' }).selectOption(sessionId);
    await openDetails(other, 'Palabras y duración');
    await drawer(other).getByLabel('Palabras', { exact: true }).fill('230');
    await drawer(other).getByRole('button', { name: 'Guardar Writing' }).click();
    await expect(other.getByRole('status').filter({ hasText: 'Writing guardado' })).toBeVisible();

    await drawer(page).getByRole('button', { name: 'Guardar Writing' }).click();
    await expect(drawer(page).getByText('ya tiene un texto', { exact: false })).toBeVisible();
    await expect(drawer(page).getByLabel('Palabras', { exact: true })).toHaveValue('271');
    expect(readPieces().filter((piece) => piece.sessionId === Number(sessionId)))
      .toEqual([expect.objectContaining({ wordCount: 230 })]);
  } finally { await other.close(); }
});

test('cada alta empieza de cero y sin sesiones libres ofrece crear una', async ({ page }) => {
  const before = readPieces();
  await createWritingSession(page);
  await createWritingSession(page);

  await openNew(page);
  await drawer(page).getByRole('combobox', { name: 'Género', exact: true }).selectOption('REVIEW');
  await openDetails(page, 'Palabras y duración');
  await drawer(page).getByLabel('Palabras', { exact: true }).fill('250');
  await drawer(page).getByLabel('Cronometrado', { exact: true }).check();
  await drawer(page).getByLabel('Es una reescritura').check();
  await expect(drawer(page).getByRole('combobox', { name: 'Texto original' })).toBeVisible();
  await drawer(page).getByLabel('Es una reescritura').uncheck();
  await drawer(page).getByRole('button', { name: 'Guardar Writing' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Writing guardado' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registrar Writing' })).toBeHidden();

  await page.getByRole('button', { name: 'Registrar Writing' }).click();
  await expect(drawer(page).getByRole('combobox', { name: 'Género', exact: true })).toHaveValue('ESSAY');
  await openDetails(page, 'Palabras y duración');
  await expect(drawer(page).getByLabel('Palabras', { exact: true })).toHaveValue('');
  await expect(drawer(page).getByLabel('Es una reescritura')).not.toBeChecked();
  await drawer(page).getByLabel('Palabras', { exact: true }).fill('251');
  await drawer(page).getByRole('button', { name: 'Guardar Writing' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Writing guardado' })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar Writing' }).click();
  await expect(drawer(page).getByText(/No hay sesiones de Writing libres/)).toBeVisible();
  await expect(drawer(page).getByRole('link', { name: 'Crear sesión Writing' })).toHaveAttribute('href', '/registrar?nueva=writing');

  const added = readPieces().filter((piece) => !before.some((existing) => existing.id === piece.id));
  expect(added).toHaveLength(2);
  expect(added).toEqual(expect.arrayContaining([
    expect.objectContaining({ wordCount: 250, genre: 'REVIEW', timed: true, rewriteOf: null }),
    expect.objectContaining({ wordCount: 251, genre: 'ESSAY', timed: false, rewriteOf: null }),
  ]));
});

test('conserva los cambios de Writing al rechazar un ciclo y permite corregirlo', async ({ page }) => {
  const before = readPieces();
  const rewrite = before.find((piece) => piece.rewriteOf !== null);
  const original = before.find((piece) => piece.id === rewrite?.rewriteOf);
  if (rewrite === undefined || original === undefined) {
    throw new Error('El seed debe incluir un original y su reescritura');
  }

  await page.goto(`/writing?edit=${String(original.id)}`);
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
  await expect(drawer(page).getByText('Ese enlace crearia un ciclo de reescrituras', { exact: true })).toBeVisible();
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
  await expect(page).toHaveURL(/\/writing$/);
  expect(readPieces().find((piece) => piece.id === original.id)).toEqual({
    ...original, wordCount: 299, genre: 'REVIEW', corrector: 'IA', timed: false, bandLanguage: 4,
  });
});

test('editar un texto carga sus datos y conserva la relacion de reescritura al guardar', async ({ page }) => {
  const before = readPieces();
  const rewrite = before.find((piece) => piece.rewriteOf !== null);
  const original = before.find((piece) => piece.id === rewrite?.rewriteOf);
  if (rewrite === undefined || original === undefined) {
    throw new Error('El seed debe incluir un original y su reescritura');
  }

  const texts = page.getByRole('table', { name: 'Textos de Writing con sus cuatro bandas' });
  await page.goto('/writing');
  // Bandas nombradas en la cabecera y «Sin evaluar» en vez de cero.
  await expect(texts.getByRole('columnheader', { name: 'Content' })).toBeVisible();

  await texts.locator(`a[href="/writing?edit=${String(rewrite.id)}"]`).click();
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
  await texts.locator(`a[href="/writing?edit=${String(original.id)}"]`).click();
  await expect(page.getByRole('heading', { name: 'Editar Writing' })).toBeVisible();
  await expect(drawer(page).getByLabel('Es una reescritura')).not.toBeChecked();
  await expect(drawer(page).getByRole('combobox', { name: 'Texto original' })).toHaveCount(0);
  await drawer(page).getByRole('button', { name: 'Cancelar' }).click();
  expect(readPieces()).toEqual(before);
});

test('desde Writing se abre una sesion de Writing y se vuelve con ella lista', async ({ page }) => {
  await page.goto('/registrar?nueva=writing');
  await expect(page.getByRole('heading', { name: 'Nueva sesión' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tipo', exact: true })).toHaveValue('WRITING');
  await expect(page.getByRole('combobox', { name: 'Formato de examen' })).toHaveValue('WRITING');
  await page.getByRole('button', { name: 'Crear sesión' }).click();

  await expect(page).toHaveURL(/\/writing\?registrar=1&sesion=\d+/);
  const sessionId = new URL(page.url()).searchParams.get('sesion') ?? '';
  await expect(page.getByRole('heading', { name: 'Registrar Writing' })).toBeVisible();
  await expect(drawer(page).getByRole('combobox', { name: 'Sesión Writing libre' })).toHaveValue(sessionId);
});
