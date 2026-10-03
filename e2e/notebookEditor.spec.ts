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
  await expect(preview.getByRole('heading', { level: 1, name: 'Past modal verbs' })).toHaveCount(1);
  await expect(preview.getByRole('heading', { level: 1, name: 'Past modal verbs' })).toHaveAttribute('id', 'nb-past-modal-verbs');
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
