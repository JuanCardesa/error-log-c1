import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookFolder } from '../src/lib/db/notebookRepo';
import { E2E_DB } from './globalSetup';

test('crea, edita y previsualiza con el mismo Markdown del lector', async ({ page }) => {
  const db = createDb(E2E_DB);
  let folderId: number;
  try {
    folderId = createNotebookFolder(db, {
      name: `Editor ${randomUUID().slice(0, 8)}`, parentId: null,
    }, new Date().toISOString()).id;
  } finally { db.$client.close(); }

  await page.goto(`/notebook/nuevo?carpeta=${String(folderId)}`);
  await expect(page.getByRole('combobox', { name: 'Carpeta' })).toHaveValue(String(folderId));
  await page.getByRole('textbox', { name: 'Título' }).fill('Past modal verbs');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('Grammar, Part4');
  const body = page.getByRole('textbox', { name: 'Contenido Markdown' });
  await body.fill('# Past modal verbs\n\nUna regla.\n\n## Must have\n\nUna deducción.');
  await body.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf('deducción');
    element.focus();
    element.setSelectionRange(start, start + 'deducción'.length);
    element.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Negrita' }).click();
  await expect(body).toHaveValue(/\*\*deducción\*\*/u);
  await expect(body).toBeFocused();

  await page.getByRole('tab', { name: 'Vista previa' }).click();
  const preview = page.getByRole('tabpanel', { name: 'Vista previa' });
  // El título de la vista previa es un h2: el h1 de la página es «Nuevo apunte».
  await expect(preview.getByRole('heading', { level: 2, name: 'Past modal verbs' })).toHaveCount(1);
  await expect(preview.getByRole('heading', { level: 2, name: 'Past modal verbs' })).toHaveAttribute('id', 'nb-past-modal-verbs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(preview.getByRole('heading', { name: 'Must have' })).toHaveAttribute('id', 'nb-must-have');
  await expect(preview.locator('strong')).toHaveText('deducción');
  await page.keyboard.press('Control+s');
  await expect(page).toHaveURL(/\/notebook\/\d+-past-modal-verbs\/editar$/u);
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Volver a lectura' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Past modal verbs' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Must have' })).toHaveAttribute('id', 'nb-must-have');
  await expect(page.locator('article strong')).toHaveText('deducción');
  await page.getByRole('link', { name: 'Editar' }).click();
  await expect(page.getByRole('textbox', { name: /Etiquetas/u })).toHaveValue('grammar, part4');
  await page.getByRole('tab', { name: 'Editar' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Vista previa' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Editar' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Título' }).fill('Past modal verbs revisited');
  await body.fill('## New rule\n\nA new explanation.');
  await page.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a lectura' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Past modal verbs revisited' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New rule' })).toBeVisible();
});

test('el editor termina como acción principal y solo ofrece «Guardar ahora» con cambios', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  const finish = page.getByRole('button', { name: 'Terminar edición' });
  await expect(finish).toBeVisible();
  // Sin nada que guardar no hay un primario gris: el botón no está.
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Título' }).fill(`Guardar ${randomUUID().slice(0, 8)}`);
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toBeEnabled();
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toHaveCount(0);

  // Las tres casillas de datos empiezan a la misma altura: la pista va bajo Etiquetas.
  const tops = await Promise.all(['Título', 'Carpeta', 'Etiquetas'].map(async (name) => {
    const field = name === 'Carpeta' ? page.getByRole('combobox', { name }) : page.getByRole('textbox', { name: new RegExp(`^${name}`, 'u') });
    return (await field.boundingBox())?.y ?? -1;
  }));
  expect(new Set(tops.map(Math.round)).size, `alturas: ${tops.join('/')}`).toBe(1);
});

test('el lector deja Exportar y Borrar en el menú del apunte', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  const title = `Lector ${randomUUID().slice(0, 8)}`;
  await page.getByRole('textbox', { name: 'Título' }).fill(title);
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('lector-e2e');
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Borrar apunte…' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Exportar .md' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Más acciones del apunte' }).click();
  await expect(page.getByRole('menuitem', { name: 'Exportar .md' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Borrar apunte…' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Una etiqueta del lector abre la portada filtrada por ella.
  await page.getByRole('list', { name: 'Etiquetas' }).getByRole('link', { name: 'lector-e2e' }).click();
  await expect(page).toHaveURL(/\/notebook\?tag=lector-e2e$/u);
  await expect(page.getByRole('button', { name: 'Etiqueta: lector-e2e' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="notebook-list-title"]').getByRole('link', { name: title })).toBeVisible();
});
