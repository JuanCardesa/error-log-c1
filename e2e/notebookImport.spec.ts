import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookFolder, deleteNotebookFolder, deleteNotebookNote, getNotebookNote } from '../src/lib/db/notebookRepo';
import { parseNotebookNoteId } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

const FILE = [
  '---',
  'title: Modales en pasado',
  'tags: [Part4, modales]',
  'notebook_uid: "9c8de1e3-03e6-42ec-a098-ac0db92331d0"',
  'autor: Ana',
  '---',
  '',
  '# Modales en pasado',
  '',
  '## Must have',
  '',
  'Deducción sobre el pasado. Ver [el otro apunte](./could-have.md).',
  '',
  '![esquema](https://tracker.example/esquema.png)',
  '',
  '<!-- nota interna -->',
].join('\n');

test('importa un .md desde la portada: revisa avisos y vista previa y crea un apunte nuevo', async ({ page }) => {
  const db = createDb(E2E_DB);
  let folderId: number;
  let folderName: string;
  try {
    folderName = `Importados ${randomUUID().slice(0, 8)}`;
    folderId = createNotebookFolder(db, { name: folderName, parentId: null }, new Date().toISOString()).id;
  } finally { db.$client.close(); }

  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://tracker.example/')) externalRequests.push(request.url());
  });

  let noteId: number | null = null;
  try {
    await page.goto(`/notebook?carpeta=${String(folderId)}`);
    await page.getByRole('link', { name: 'Importar .md' }).click();
    await expect(page).toHaveURL(`/notebook/importar?carpeta=${String(folderId)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Importar apunte' })).toBeVisible();

    await page.getByLabel(/Archivo Markdown/u).setInputFiles({
      name: 'modales.md', mimeType: 'text/markdown', buffer: Buffer.from(FILE, 'utf8'),
    });
    const form = page.getByRole('form', { name: 'Importar modales.md' });
    await expect(form.getByLabel(/^Título/u)).toHaveValue('Modales en pasado');
    await expect(form.getByText('Tomado del frontmatter.')).toBeVisible();
    await expect(form.getByRole('combobox', { name: 'Carpeta' })).toHaveValue(String(folderId));
    await expect(form.getByLabel(/^Etiquetas/u)).toHaveValue('part4, modales');

    const notices = form.getByRole('region', { name: 'Antes de importar' });
    await expect(notices.getByText(/1 fragmento HTML o comentario/u)).toBeVisible();
    await expect(notices.getByText(/1 imagen: se conservan como texto/u)).toBeVisible();
    await expect(notices.getByText(/1 enlace apunta a otros archivos/u)).toBeVisible();
    await expect(notices.getByText('Campos del frontmatter que no se importan: autor.')).toBeVisible();
    await expect(notices.getByText(/notebook_uid vienen de otra exportación/u)).toBeVisible();

    const preview = form.getByRole('region', { name: 'Vista previa del apunte' });
    await expect(preview.getByRole('heading', { level: 1, name: 'Modales en pasado' })).toHaveCount(1);
    await expect(preview.getByRole('heading', { name: 'Must have' })).toHaveAttribute('id', 'nb-must-have');
    await expect(preview.getByText('![esquema](https://tracker.example/esquema.png)')).toBeVisible();

    await form.getByLabel(/^Título/u).fill('Modales en pasado (importado)');
    await form.getByLabel(/^Etiquetas/u).fill('part4, modales, importado');
    await form.getByRole('button', { name: 'Crear apunte' }).click();

    await expect(page).toHaveURL(/\/notebook\/\d+-modales-en-pasado-importado$/u);
    noteId = parseNotebookNoteId(new URL(page.url()).pathname.split('/').pop() ?? '');
    await expect(page.getByRole('heading', { level: 1, name: 'Modales en pasado (importado)' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta del apunte' }).getByRole('link', { name: folderName })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Etiquetas' })).toHaveText(/part4\s*modales\s*importado/u);
    await expect(page.getByRole('heading', { name: 'Must have' })).toBeVisible();
    expect(await page.locator('img').count()).toBe(0);
    expect(externalRequests).toEqual([]);

    const readDb = createDb(E2E_DB);
    try {
      const saved = noteId === null ? null : getNotebookNote(readDb, noteId);
      // El UID del frontmatter no se reutiliza y el cuerpo llega sin frontmatter.
      expect(saved?.uid).not.toBe('9c8de1e3-03e6-42ec-a098-ac0db92331d0');
      expect(saved?.contentMarkdown.startsWith('# Modales en pasado\n')).toBe(true);
    } finally { readDb.$client.close(); }
  } finally {
    const cleanup = createDb(E2E_DB);
    try {
      const saved = noteId === null ? null : getNotebookNote(cleanup, noteId);
      if (saved !== null) deleteNotebookNote(cleanup, { id: saved.id, uid: saved.uid, expectedRevision: saved.revision });
      deleteNotebookFolder(cleanup, folderId);
    } finally { cleanup.$client.close(); }
  }
});

test('explica los archivos que no se importan y conserva el frontmatter que no entiende', async ({ page }) => {
  await page.goto('/notebook/importar');
  const input = page.getByLabel(/Archivo Markdown/u);
  // Next añade su anunciador de rutas con role=alert fuera de <main>.
  const alerts = page.getByRole('main').getByRole('alert');

  await input.setInputFiles({ name: 'roto.md', mimeType: 'text/markdown', buffer: Buffer.from([0x23, 0x20, 0xc3, 0x28]) });
  await expect(alerts).toHaveText('El archivo no es texto UTF-8 válido.');
  await expect(page.getByRole('button', { name: 'Crear apunte' })).toHaveCount(0);

  await input.setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('Texto') });
  await expect(alerts).toHaveText('Elige un archivo .md o .markdown.');

  await input.setInputFiles({
    name: 'yaml-roto.md', mimeType: 'text/markdown', buffer: Buffer.from('---\ntitle: a\n  mal: sangrado\n---\n\n# Del encabezado\n'),
  });
  const form = page.getByRole('form', { name: 'Importar yaml-roto.md' });
  await expect(form.getByRole('region', { name: 'Antes de importar' }))
    .toContainText('El frontmatter no es YAML válido (línea 2). Se conserva como texto al principio del apunte');
  await expect(form.getByLabel(/^Título/u)).toHaveValue('Del encabezado');
  await expect(form.getByRole('region', { name: 'Vista previa del apunte' }).getByText('title: a')).toBeVisible();
  await expect(alerts).toHaveCount(0);
});
