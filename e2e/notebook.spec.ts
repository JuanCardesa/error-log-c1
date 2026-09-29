import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookFolder, createNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

test('abre por ID, devuelve 404 para IDs inexistentes y conserva enlaces al renombrar y mover', async ({ page }) => {
  const db = createDb(E2E_DB);
  let oldHref: string;
  let folderId: number;
  try {
    const at = new Date().toISOString();
    const first = createNotebookFolder(db, { name: `Grammar ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    const second = createNotebookFolder(db, { name: `Vocabulary ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    folderId = second.id;
    const { note } = createNotebookNote(db, {
      uid: randomUUID(), title: 'Past modal verbs', folderId: first.id,
      tags: ['grammar'], contentMarkdown: [
        '# Must have',
        'A deduction.',
        '',
        '![pixel](https://tracker.example/pixel.png)',
        '',
        '<script>window.__notebookPwned = true</script>',
      ].join('\n'),
    }, at);
    oldHref = notebookNoteHref(note);
    saveNotebookNote(db, {
      id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: 'Modal verbs in the past', folderId: second.id,
      tags: [...note.tags], contentMarkdown: note.contentMarkdown,
    }, new Date().toISOString());
  } finally { db.$client.close(); }

  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://tracker.example/')) externalRequests.push(request.url());
  });
  await page.goto(oldHref);
  await expect(page.getByRole('heading', { level: 1, name: 'Modal verbs in the past' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta del apunte' }).getByRole('link', { name: /Vocabulary/ })).toHaveAttribute('href', `/notebook?carpeta=${String(folderId)}`);
  await expect(page.getByRole('heading', { name: 'Must have' })).toHaveAttribute('id', 'nb-must-have');
  await expect(page.getByText('![pixel](https://tracker.example/pixel.png)')).toBeVisible();
  expect(await page.locator('img').count()).toBe(0);
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(window, '__notebookPwned'))).toBeUndefined();

  await page.goto('/notebook/999999999-not-found');
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  await page.goto('/notebook/nuevo');
  await expect(page.getByRole('heading', { name: 'Nuevo apunte' })).toBeVisible();
});

test('muestra carpetas anidadas, estados vacíos y permite crear y renombrar carpetas', async ({ page }) => {
  await page.goto('/notebook');
  await expect(page.getByRole('heading', { level: 1, name: 'Notebook' })).toBeVisible();
  await page.getByText('Organizar carpetas').click();
  const createForm = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await createForm.getByRole('textbox', { name: 'Nombre' }).fill('Grammar');
  await createForm.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page).toHaveURL(/carpeta=\d+/);
  await expect(page.getByText('Aquí aún no hay apuntes.')).toBeVisible();

  await page.getByText('Organizar carpetas').click();
  const editForm = page.getByRole('heading', { name: 'Editar Grammar' }).locator('..');
  await editForm.getByRole('textbox', { name: 'Nombre' }).fill('Grammar notes');
  await editForm.getByRole('button', { name: 'Guardar carpeta' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Grammar notes' })).toBeVisible();

  const createSubfolderForm = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await createSubfolderForm.getByRole('textbox', { name: 'Nombre' }).fill('Modal verbs');
  await createSubfolderForm.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name: 'Modal verbs' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('button', { name: 'Contraer Grammar notes' }).click();
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name: 'Modal verbs' })).toBeHidden();
});

test('el índice conserva hashes, teclado, duplicados y movimiento reducido', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: 'Past modal verbs', folderId: null, tags: [],
      contentMarkdown: [
        '# Past modal verbs',
        ...Array.from({ length: 12 }, () => 'Una explicación con ejemplos y práctica.'),
        '## Must have',
        ...Array.from({ length: 12 }, () => 'Otra explicación con más ejemplos.'),
        '## Must have',
        'Sección duplicada.',
      ].join('\n\n'),
    }, new Date().toISOString()).note;
    href = notebookNoteHref(note);
  } finally { db.$client.close(); }

  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`${href}#nb-must-have-1`);
  const toc = page.getByRole('navigation', { name: 'Índice del apunte' });
  const links = toc.getByRole('link', { name: 'Must have' });
  await expect(page.getByRole('heading', { level: 1, name: 'Past modal verbs' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Past modal verbs' })).toHaveAttribute('id', 'nb-past-modal-verbs');
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'location');
  await links.first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#nb-must-have$/u);
  await expect(links.first()).toHaveAttribute('aria-current', 'location');

  await page.goBack();
  await expect(page).toHaveURL(/#nb-must-have-1$/u);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'location');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    Reflect.set(window, '__notebookScrollCalls', []);
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(options) {
      (Reflect.get(window, '__notebookScrollCalls') as ScrollIntoViewOptions[]).push(options as ScrollIntoViewOptions);
      original.call(this, options);
    };
  });
  await links.first().click();
  const calls = await page.evaluate(() => Reflect.get(window, '__notebookScrollCalls') as ScrollIntoViewOptions[]);
  expect(calls.at(-1)?.behavior).toBe('auto');

  await page.setViewportSize({ width: 800, height: 700 });
  const disclosure = page.getByText('En esta nota', { exact: true }).last();
  await disclosure.click();
  await expect(page.getByRole('navigation', { name: 'Índice del apunte' }).getByRole('link', { name: 'Must have' }).first()).toBeVisible();
});

test('en una nota breve, el hash decide el apartado activo aunque no haya scroll', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: 'Nota breve', folderId: null, tags: [],
      contentMarkdown: '## Primero\n\nUna frase.\n\n## Segundo\n\nOtra frase.',
    }, new Date().toISOString()).note;
    href = notebookNoteHref(note);
  } finally { db.$client.close(); }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${href}#nb-primero`);
  const toc = page.getByRole('navigation', { name: 'Índice del apunte' });
  await expect(toc.getByRole('link', { name: 'Primero' })).toHaveAttribute('aria-current', 'location');
  await toc.getByRole('link', { name: 'Segundo' }).click();
  await expect(toc.getByRole('link', { name: 'Segundo' })).toHaveAttribute('aria-current', 'location');
});

test('busca en título, etiquetas y cuerpo con filtros, fragmento y enlace al apartado', async ({ page }) => {
  const db = createDb(E2E_DB);
  let rootId: number;
  let childId: number;
  let bodyHref: string;
  try {
    const at = new Date().toISOString();
    const root = createNotebookFolder(db, { name: `Search root ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    const child = createNotebookFolder(db, { name: 'Search child', parentId: root.id }, at);
    const other = createNotebookFolder(db, { name: `Search other ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    rootId = root.id;
    childId = child.id;
    createNotebookNote(db, {
      uid: randomUUID(), title: 'Catenative inversion', folderId: root.id, tags: ['syntax'], contentMarkdown: 'Solo título.',
    }, at);
    createNotebookNote(db, {
      uid: randomUUID(), title: 'Catenative inversion in context', folderId: child.id, tags: ['syntax'], contentMarkdown: 'Otro texto.',
    }, at);
    createNotebookNote(db, {
      uid: randomUUID(), title: 'Tagged syntax', folderId: other.id, tags: ['catenative inversion'], contentMarkdown: 'Otro texto.',
    }, at);
    const body = createNotebookNote(db, {
      uid: randomUUID(), title: 'Markdown syntax', folderId: null, tags: ['syntax'],
      contentMarkdown: '## Regla\n\nTexto inicial.\n\n## Regla\n\nLa catenative **inversion** aparece aquí.',
    }, at).note;
    bodyHref = notebookNoteHref(body);
  } finally { db.$client.close(); }

  await page.goto('/notebook');
  const search = page.getByRole('searchbox', { name: 'Buscar apuntes' });
  await search.fill('Catenative inversion');
  await expect(page).toHaveURL(/q=Catenative\+inversion/u);
  const results = page.locator('section[aria-labelledby="notebook-list-title"]');
  await expect(results.getByRole('link', { name: 'Catenative inversion', exact: true })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Catenative inversion in context' })).toBeVisible();
  const bodyLink = results.getByRole('link', { name: 'Markdown syntax' });
  await expect(bodyLink).toHaveAttribute('href', `${bodyHref}#nb-regla-1`);
  await expect(results.getByText(/La catenative inversion aparece aquí/u)).toBeVisible();
  await expect(results.locator('mark')).toHaveCount(4);

  await page.getByRole('combobox', { name: 'Carpeta' }).selectOption(String(rootId));
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(new RegExp(`carpeta=${String(rootId)}`));
  await expect(results.getByRole('link', { name: 'Catenative inversion', exact: true })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Catenative inversion in context' })).toBeVisible();
  await expect(bodyLink).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Carpeta' }).selectOption(String(childId));
  await page.getByRole('textbox', { name: 'Etiqueta' }).fill('syntax');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(results.getByRole('link', { name: 'Catenative inversion in context' })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Catenative inversion', exact: true })).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Carpeta' }).selectOption('sin-carpeta');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(bodyLink).toBeVisible();
  await bodyLink.click();
  await expect(page).toHaveURL(/#nb-regla-1$/u);
});

test('pagina resultados conservando la búsqueda y la carpeta', async ({ page }) => {
  const db = createDb(E2E_DB);
  let folderId: number;
  try {
    const at = new Date().toISOString();
    const folder = createNotebookFolder(db, { name: `Paged search ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    folderId = folder.id;
    for (let i = 1; i <= 21; i += 1) {
      createNotebookNote(db, {
        uid: randomUUID(), title: `Result ${String(i)}`, folderId: folder.id, tags: [],
        contentMarkdown: 'Glossopharyngeal practice.',
      }, at);
    }
  } finally { db.$client.close(); }

  await page.goto(`/notebook?carpeta=${String(folderId)}&q=glossopharyngeal`);
  const results = page.locator('section[aria-labelledby="notebook-list-title"]');
  await expect(results.locator('ul').first().locator(':scope > li')).toHaveCount(20);
  await page.getByRole('navigation', { name: 'Páginas de apuntes' }).getByRole('link', { name: 'Siguiente' }).click();
  await expect(page).toHaveURL(new RegExp(`carpeta=${String(folderId)}.*q=glossopharyngeal.*p=2`));
  await expect(results.getByRole('link', { name: 'Result 1', exact: true })).toBeVisible();
  await expect(results.locator('ul').first().locator(':scope > li')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Páginas de apuntes' }).getByRole('link', { name: 'Anterior' }).click();
  await expect(results.locator('ul').first().locator(':scope > li')).toHaveCount(20);
});

test('la paleta muestra hasta tres apuntes junto a errores y sesiones y navega por ID', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const at = new Date().toISOString();
    let newest = createNotebookNote(db, {
      uid: randomUUID(), title: 'Commitment note 1', folderId: null, tags: [], contentMarkdown: 'Texto.',
    }, at).note;
    for (let i = 2; i <= 4; i += 1) {
      newest = createNotebookNote(db, {
        uid: randomUUID(), title: `Commitment note ${String(i)}`, folderId: null, tags: [], contentMarkdown: 'Texto.',
      }, at).note;
    }
    href = notebookNoteHref(newest);
  } finally { db.$client.close(); }

  await page.goto('/registrar');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Buscar' });
  await expect(search).toBeFocused();
  await search.fill('commitment');
  await expect(page.getByRole('option', { name: /Commitment note/u })).toHaveCount(3);
  await expect(page.getByRole('option').filter({ hasText: 'commitement' })).toBeVisible();
  await expect(page.getByRole('option', { name: /Commitment note 1/u })).toHaveCount(0);
  await page.getByRole('option', { name: /Commitment note 4/u }).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  await page.keyboard.press('Control+k');
  // «Unidad 1» a secas empata con las sesiones Unidad 1X de otros specs y el tope es de tres.
  await search.fill('Unidad 1, ej');
  await expect(page.getByRole('option', { name: /Unidad 1, ej/u })).toBeVisible();
  await expect(page.getByRole('option', { name: /Commitment note/u })).toHaveCount(0);
});

test('la paleta descarta una respuesta antigua al limpiar la consulta', async ({ page }) => {
  await page.goto('/registrar');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Buscar' });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let caught!: () => void;
  const intercepted = new Promise<void>((resolve) => { caught = resolve; });
  let delayed = false;
  await page.route('**/registrar', async (route) => {
    if (route.request().method() === 'POST' && !delayed) {
      delayed = true;
      caught();
      await pending;
    }
    await route.continue();
  });
  await search.fill('commitment');
  await intercepted;
  await search.fill('');
  const completed = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes('/registrar'));
  release();
  await completed;
  await page.waitForTimeout(100);
  await expect(page.getByRole('option', { name: 'Ir a Notebook' })).toBeVisible();
  await expect(page.getByRole('option').filter({ hasText: 'commitement' })).toHaveCount(0);
});
