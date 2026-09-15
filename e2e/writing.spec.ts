import { expect, test } from '@playwright/test';

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

test('prepara un formulario vacio tras guardar un nuevo texto', async ({ page }) => {
  const before = readPieces();
  for (let index = 0; index < 2; index += 1) {
    await page.goto('/registrar');
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('WRITING');
    await page.getByRole('button', { name: 'Abrir sesion' }).click();
    await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
  }

  await page.getByRole('navigation').getByRole('link', { name: 'Writing', exact: true }).click();
  await page.getByLabel('Palabras', { exact: true }).fill('250');
  await page.getByRole('combobox', { name: 'Genero', exact: true }).selectOption('REVIEW');
  await page.getByLabel('Cronometrado', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar texto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Texto guardado.');
  await expect(page.getByLabel('Palabras', { exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Genero', exact: true })).toHaveValue('ESSAY');
  await expect(page.getByLabel('Cronometrado', { exact: true })).not.toBeChecked();

  await page.getByLabel('Palabras', { exact: true }).fill('251');
  await page.getByRole('button', { name: 'Guardar texto', exact: true }).click();
  await expect(page.getByText(/No hay sesiones de Writing libres/)).toBeVisible();
  const added = readPieces().filter((piece) => !before.some((existing) => existing.id === piece.id));
  expect(added).toHaveLength(2);
  expect(added).toEqual(expect.arrayContaining([
    expect.objectContaining({ wordCount: 250, genre: 'REVIEW', timed: true }),
    expect.objectContaining({ wordCount: 251, genre: 'ESSAY', timed: false }),
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
  await page.getByLabel('Palabras', { exact: true }).fill('299');
  await page.getByRole('combobox', { name: 'Genero', exact: true }).selectOption('REVIEW');
  await page.getByRole('combobox', { name: 'Corrector', exact: true }).selectOption('IA');
  await page.getByLabel('Cronometrado', { exact: true }).uncheck();
  await page.getByLabel('Language', { exact: true }).fill('4');
  await page.getByLabel('Es la reescritura de otro texto').check();
  await page.getByRole('combobox', { name: 'Original', exact: true }).selectOption(String(rewrite.id));
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByText('Ese enlace crearia un ciclo de reescrituras', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Palabras', { exact: true })).toHaveValue('299');
  await expect(page.getByRole('combobox', { name: 'Genero', exact: true })).toHaveValue('REVIEW');
  await expect(page.getByRole('combobox', { name: 'Corrector', exact: true })).toHaveValue('IA');
  await expect(page.getByLabel('Cronometrado', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('4');
  await expect(page.getByRole('combobox', { name: /^Original\b/ })).toHaveValue(String(rewrite.id));
  expect(readPieces()).toEqual(before);

  await page.getByLabel('Es la reescritura de otro texto').uncheck();
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Texto actualizado.');
  await page.reload();
  await expect(page.getByLabel('Palabras', { exact: true })).toHaveValue('299');
  await expect(page.getByRole('combobox', { name: 'Genero', exact: true })).toHaveValue('REVIEW');
  expect(readPieces().find((piece) => piece.id === original.id)).toEqual({
    ...original, wordCount: 299, genre: 'REVIEW', corrector: 'IA', timed: false, bandLanguage: 4,
  });
});

test('cambiar de texto carga sus datos y conserva la relacion de reescritura al guardar', async ({
  page,
}) => {
  const before = readPieces();
  const rewrite = before.find((piece) => piece.rewriteOf !== null);
  const original = before.find((piece) => piece.id === rewrite?.rewriteOf);
  if (rewrite === undefined || original === undefined) {
    throw new Error('El seed debe incluir un original y su reescritura');
  }

  const texts = page.getByRole('table', { name: 'Textos de Writing con sus bandas' });
  const rewriteToggle = page.getByLabel('Es la reescritura de otro texto');

  await page.goto(`/writing?edit=${String(original.id)}`);
  await expect(rewriteToggle).not.toBeChecked();

  // Se ensucian campos no controlados del original antes de navegar con un Link.
  // Una carga completa de pagina ocultaria el fallo de reutilizacion del formulario.
  await page.getByLabel('Palabras', { exact: true }).fill('111');
  await page.getByLabel('Minutos', { exact: true }).fill('99');
  await page.getByRole('combobox', { name: 'Genero', exact: true }).selectOption('REVIEW');
  await page.getByRole('combobox', { name: 'Corrector', exact: true }).selectOption('IA');
  await page.getByLabel('Language', { exact: true }).fill('0');
  await page.getByLabel('Cronometrado', { exact: true }).uncheck();

  await texts.locator(`a[href="/writing?edit=${String(rewrite.id)}"]`).click();
  await expect(page.getByRole('heading', { name: `Editar texto #${String(rewrite.id)}` })).toBeVisible();
  await expect(page.getByLabel('Palabras', { exact: true })).toHaveValue(String(rewrite.wordCount));
  await expect(page.getByLabel('Minutos', { exact: true })).toHaveValue(String(rewrite.minutes));
  await expect(page.getByRole('combobox', { name: 'Genero', exact: true })).toHaveValue(rewrite.genre);
  await expect(page.getByRole('combobox', { name: 'Corrector', exact: true })).toHaveValue(rewrite.corrector ?? '');
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue(String(rewrite.bandLanguage));
  await expect(page.getByLabel('Cronometrado', { exact: true })).toBeChecked({ checked: rewrite.timed });
  await expect(rewriteToggle).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Original', exact: true })).toHaveValue(String(original.id));

  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Texto actualizado.');
  expect(readPieces()).toEqual(before);

  // En sentido inverso tampoco se arrastran el checkbox ni el mensaje de guardado.
  await texts.locator(`a[href="/writing?edit=${String(original.id)}"]`).click();
  await expect(page.getByRole('heading', { name: `Editar texto #${String(original.id)}` })).toBeVisible();
  await expect(page.getByLabel('Palabras', { exact: true })).toHaveValue(String(original.wordCount));
  await expect(rewriteToggle).not.toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Original', exact: true })).toHaveCount(0);
  await expect(page.getByText('Texto actualizado.', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Texto actualizado.');
  expect(readPieces()).toEqual(before);
});
