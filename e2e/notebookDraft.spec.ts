import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

test('recupera tras recarga desde la portada y elimina la copia al confirmar el guardado', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  await page.getByRole('textbox', { name: 'Título' }).fill('Borrador interrumpido');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('## Regla\n\nSin guardar todavía.');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:')).length)).toBe(1);
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Borrador recuperable' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Título' })).toBeDisabled();
  await page.goto('/notebook');
  await expect(page.getByRole('heading', { name: 'Borradores locales pendientes (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir borrador' }).click();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('Borrador interrumpido');
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('## Regla\n\nSin guardar todavía.');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('');
  await page.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect(page).toHaveURL(/\/notebook\/\d+-borrador-interrumpido\/editar$/u);
  await page.goto('/notebook');
  await expect(page.getByRole('heading', { name: /Borradores locales pendientes/u })).toHaveCount(0);
});

test('dos pestañas conservan copias separadas y una revisión antigua no sobrescribe la nueva', async ({ context }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: 'Dos pestañas', folderId: null, tags: [], contentMarkdown: 'Texto original.',
    }, new Date().toISOString()).note;
    href = `${notebookNoteHref(note)}/editar`;
  } finally { db.$client.close(); }

  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) page.on('dialog', (dialog) => { void dialog.accept(); });
  await first.goto(href);
  await second.goto(href);
  await first.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Cambio de la primera pestaña.');
  await second.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Cambio de la segunda pestaña.');
  await first.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await second.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await expect.poll(() => first.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:note:')).length)).toBe(2);
  await first.reload();
  await second.reload();
  await first.getByRole('button', { name: 'Recuperar borrador' }).click();
  await second.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(first.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Cambio de la primera pestaña.');
  await expect(second.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Cambio de la segunda pestaña.');
  await first.getByRole('textbox', { name: /Etiquetas/u }).fill('');
  await first.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect(first.getByText('Guardado', { exact: true })).toBeVisible();
  await second.reload();
  await second.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(second.getByRole('alert').filter({ hasText: 'El apunte guardado cambió' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Guardar ahora' })).toBeDisabled();
  await expect(second.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Cambio de la segunda pestaña.');
  await expect.poll(() => second.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('errorlog:notebook:draft:note:'));
    if (key === undefined) return null;
    return (JSON.parse(localStorage.getItem(key) ?? '{}') as { baseRevision?: number }).baseRevision ?? null;
  })).toBe(1);
  await second.reload();
  await second.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(second.getByRole('alert').filter({ hasText: 'El apunte guardado cambió' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Guardar ahora' })).toBeDisabled();
  await first.close();
  await second.close();
});

test('avisa de cuota agotada y permite descargar el texto pendiente', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key.startsWith('errorlog:notebook:draft:')) throw new DOMException('Sin espacio', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('textbox', { name: 'Título' }).fill('Sin espacio');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Mi texto recuperable.');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await expect(page.getByRole('alert').filter({ hasText: 'Se agotó el espacio' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar borrador' }).click();
  const download = await downloadPromise;
  const raw = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(raw)).toMatchObject({ title: 'Sin espacio', contentMarkdown: 'Mi texto recuperable.' });
});

test('ignora un borrador local con formato inválido', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  await page.evaluate(() => {
    const tabId = window.name.slice('errorlog:notebook:tab:'.length);
    localStorage.setItem(`errorlog:notebook:draft:new:${tabId}`, '{incompleto');
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Borrador recuperable' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Título' }).fill('Apunte nuevo');
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('Apunte nuevo');
});

test('descarta una copia local con confirmación sin tocar el apunte guardado', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  await page.getByRole('textbox', { name: 'Título' }).fill('Borrador descartable');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:')).length)).toBe(1);
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload();
  await page.getByRole('button', { name: 'Descartar borrador…' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Descartar borrador local' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar borrador' }).click();
  await expect(page.getByRole('region', { name: 'Borrador recuperable' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:')).length)).toBe(0);
});

test('al abrir un borrador ajeno conserva primero el pendiente de esta pestaña', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  first.on('dialog', (dialog) => { void dialog.accept(); });
  await first.goto('/notebook/nuevo');
  await second.goto('/notebook/nuevo');
  await first.getByRole('textbox', { name: 'Título' }).fill('Borrador propio');
  await second.getByRole('textbox', { name: 'Título' }).fill('Borrador ajeno');
  await first.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await second.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  await expect.poll(() => first.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:new:')).length)).toBe(2);
  await first.goto('/notebook');
  const notices = first.getByRole('region', { name: /Borradores locales pendientes/u });
  await notices.getByRole('listitem').filter({ hasText: 'Borrador ajeno' }).getByRole('link', { name: 'Abrir borrador' }).click();
  await expect(first.getByText('Esta pestaña tiene otro borrador pendiente', { exact: false })).toBeVisible();
  await first.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(first.getByRole('textbox', { name: 'Título' })).toHaveValue('Borrador propio');
  await expect.poll(() => first.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:new:')).length)).toBe(2);
  await first.close();
  await second.close();
});
