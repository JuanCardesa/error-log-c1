import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { setErrorNoteLink } from '../src/lib/db/notebookLinkRepo';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, listNotebookFolders } from '../src/lib/db/notebookRepo';
import { createError, deleteError } from '../src/lib/db/repo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Lo que pasa cuando el transporte falla. Las Server Actions de Notebook viajan como POST
 * a la ruta actual con los argumentos en el cuerpo, así que cada prueba corta exactamente
 * la llamada que le interesa mirando ese cuerpo, una sola vez, y comprueba dos cosas: que
 * la pantalla lo dice con palabras y que reintentar termina el trabajo sin duplicarlo.
 *
 * Al final, el recorrido 9 del plan: borrar el error, la sesión y el apunte, y ver qué
 * se lleva por delante cada uno.
 */

type Cut = { readonly release: () => Promise<void> };

/**
 * Corta una vez la acción cuyo cuerpo cumple `matches`. Con `afterServer` la petición sí
 * llega y lo que se pierde es la respuesta: es el caso que puede duplicar trabajo.
 */
async function cutOnce(
  page: Page,
  matches: (body: string) => boolean,
  options: { readonly afterServer?: boolean } = {},
): Promise<Cut> {
  let used = false;
  const handler = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    const request = route.request();
    if (used || request.method() !== 'POST' || !matches(request.postData() ?? '')) {
      await route.continue();
      return;
    }
    used = true;
    if (options.afterServer === true) await route.fetch();
    await route.abort('failed');
  };
  await page.route('**', handler);
  return { release: () => page.unroute('**', handler) };
}

function seedNote(title: string, contentMarkdown = '## Apartado uno\n\nTexto del apunte.') {
  const db = createDb(E2E_DB);
  try {
    return createNotebookNote(db, {
      uid: randomUUID(), title, folderId: null, tags: [], contentMarkdown,
    }, new Date().toISOString()).note;
  } finally { db.$client.close(); }
}

/** Un error propio, clonado del seed, para no tocar los que usan otros specs. */
function seedError(itemRef: string, correctAnswer: string) {
  const db = createDb(E2E_DB);
  try {
    const sample = loadDataset(db).errors[0];
    if (sample === undefined) throw new Error('Falta un error en el seed');
    const { id: _id, createdAt: _createdAt, ...base } = sample;
    return createError(db, {
      ...base, itemRef, prompt: `Frase de prueba ${itemRef}`,
      myAnswer: 'mi respuesta', correctAnswer, confidence: 'DUDABA',
    });
  } finally { db.$client.close(); }
}

function cleanUp({ errorIds = [], noteIds = [] }: {
  readonly errorIds?: readonly number[];
  readonly noteIds?: readonly number[];
}) {
  const db = createDb(E2E_DB);
  try {
    for (const errorId of errorIds) deleteError(db, errorId);
    for (const noteId of noteIds) {
      const note = getNotebookNote(db, noteId);
      if (note !== null) deleteNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision });
    }
  } finally { db.$client.close(); }
}

test('el selector de apuntes avisa cuando la búsqueda, el vínculo o la desvinculación no llegan', async ({ page }) => {
  const title = `Apunte sin red ${randomUUID().slice(0, 8)}`;
  const note = seedNote(title);
  const error = seedError('fail-1', 'la corrección sin red');

  try {
    await page.goto(`/errores?error=${String(error.id)}`);
    const links = page.getByRole('region', { name: 'Apuntes vinculados' });

    // La primera búsqueda sale sola al abrir el selector: se corta esa.
    const search = await cutOnce(page, (body) => body.includes('"query"'));
    await links.getByRole('button', { name: 'Vincular apunte' }).click();
    await expect(links.getByText('No se pudo buscar en los apuntes.')).toBeVisible();
    await search.release();

    await links.getByRole('searchbox', { name: 'Buscar apuntes' }).fill(title);
    const results = links.getByRole('list', { name: 'Apuntes encontrados' });
    await expect(results.getByRole('button', { name: title })).toBeVisible();
    await expect(links.getByText('No se pudo buscar en los apuntes.')).toHaveCount(0);

    await results.getByRole('button', { name: title }).click();
    const save = await cutOnce(page, (body) => body.includes('"headingSlug"'));
    await links.getByRole('combobox', { name: 'Apartado' }).selectOption({ label: 'Apartado uno' });
    await links.getByRole('button', { name: 'Guardar vínculo' }).click();
    await expect(links.getByText('No se pudo guardar el vínculo. Inténtalo de nuevo.')).toBeVisible();
    // El selector sigue donde estaba: el apartado elegido no se pierde al reintentar.
    await expect(links.getByRole('combobox', { name: 'Apartado' })).toHaveValue('nb-apartado-uno');
    await save.release();

    await links.getByRole('button', { name: 'Guardar vínculo' }).click();
    await expect(links.getByRole('link', { name: title }))
      .toHaveAttribute('href', `${notebookNoteHref(note)}#nb-apartado-uno`);

    const remove = await cutOnce(page, (body) => body.includes('"noteId"'));
    await links.getByRole('button', { name: 'Desvincular' }).click();
    await expect(links.getByText('No se pudo desvincular el apunte. Inténtalo de nuevo.')).toBeVisible();
    await expect(links.getByRole('link', { name: title })).toBeVisible();
    await remove.release();

    await links.getByRole('button', { name: 'Desvincular' }).click();
    await expect(links.getByText('Este error aún no tiene apuntes vinculados.')).toBeVisible();
  } finally {
    cleanUp({ errorIds: [error.id], noteIds: [note.id] });
  }
});

test('el lector avisa cuando los errores relacionados no cargan ni se desvinculan', async ({ page }) => {
  const note = seedNote(`Apunte con errores sin red ${randomUUID().slice(0, 8)}`);
  const first = seedError('fail-2', 'la primera corrección');
  const second = seedError('fail-3', 'la segunda corrección');
  const db = createDb(E2E_DB);
  try {
    const at = new Date().toISOString();
    setErrorNoteLink(db, { errorId: first.id, noteId: note.id, headingSlug: null }, at);
    setErrorNoteLink(db, { errorId: second.id, noteId: note.id, headingSlug: null }, at);
  } finally { db.$client.close(); }

  try {
    const load = await cutOnce(page, (body) => body.includes('"noteId"'));
    await page.goto(notebookNoteHref(note));
    const related = page.getByRole('region', { name: 'Errores relacionados' });
    await expect(related.getByText('No se pudieron cargar los errores relacionados.')).toBeVisible();
    // El apunte se lee igual: lo que falló fue la lista de al lado.
    await expect(page.getByRole('heading', { level: 1, name: note.title })).toBeVisible();
    await load.release();

    await page.reload();
    await expect(related.getByRole('listitem')).toHaveCount(2);

    const remove = await cutOnce(page, (body) => body.includes('"errorId"'));
    await related.getByRole('listitem').first().getByRole('button', { name: 'Desvincular' }).click();
    await expect(related.getByText('No se pudo desvincular el error. Inténtalo de nuevo.')).toBeVisible();
    await expect(related.getByRole('listitem')).toHaveCount(2);
    await remove.release();

    await related.getByRole('listitem').first().getByRole('button', { name: 'Desvincular' }).click();
    await expect(related.getByRole('listitem')).toHaveCount(1);
  } finally {
    cleanUp({ errorIds: [first.id, second.id], noteIds: [note.id] });
  }
});

test('la portada avisa si la carpeta no se llega a crear y reintentar crea solo una', async ({ page }) => {
  const name = `Carpeta sin red ${randomUUID().slice(0, 8)}`;
  await page.goto('/notebook');
  await page.locator('summary').filter({ hasText: 'Organizar carpetas' }).click();
  const form = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await form.getByRole('textbox', { name: 'Nombre' }).fill(name);

  const create = await cutOnce(page, (body) => body.includes('"parentId"'));
  await form.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo crear la carpeta' })).toBeVisible();
  await expect(page).not.toHaveURL(/carpeta=\d+/u);
  await create.release();

  await form.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page).toHaveURL(/carpeta=\d+/u);
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();

  const db = createDb(E2E_DB);
  try {
    expect(listNotebookFolders(db).filter((folder) => folder.name === name)).toHaveLength(1);
  } finally { db.$client.close(); }
});

test('importar avisa si el análisis o la confirmación se pierden y reintentar no duplica', async ({ page }) => {
  const title = `Importado sin red ${randomUUID().slice(0, 8)}`;
  const file = {
    name: 'sin-red.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(`# ${title}\n\nUn cuerpo cualquiera.\n`, 'utf8'),
  };

  await page.goto('/notebook/importar');
  const chooser = page.getByLabel(/Archivo Markdown/u);

  // La vista previa no llega: el archivo se vuelve a elegir y ya está.
  const preview = await cutOnce(page, (body) => body.includes('filename="sin-red.md"') && !body.includes('_1_uid'));
  await chooser.setInputFiles(file);
  await expect(page.getByText('No se pudo analizar el archivo. Vuelve a elegirlo.')).toBeVisible();
  await preview.release();

  await chooser.setInputFiles(file);
  const form = page.getByRole('form', { name: 'Importar sin-red.md' });
  await expect(form.getByLabel(/^Título/u)).toHaveValue(title);

  // La confirmación sí llega al servidor y lo que se pierde es la respuesta: el apunte
  // queda creado sin que la pantalla lo sepa, y el reintento tiene que reconocerlo.
  const confirm = await cutOnce(page, (body) => body.includes('_1_uid'), { afterServer: true });
  await form.getByRole('button', { name: 'Crear apunte' }).click();
  await expect(page.getByText(/No se pudo confirmar la importación/u)).toBeVisible();
  await confirm.release();

  await form.getByRole('button', { name: 'Crear apunte' }).click();
  await expect(page).toHaveURL(/\/notebook\/\d+-importado-sin-red/u);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const db = createDb(E2E_DB);
  try {
    // Un solo apunte pese a los dos intentos: el UID de la vista previa es el mismo.
    const rows = db.$client.prepare('select id from notebook_note where title = ?').all(title);
    expect(rows).toHaveLength(1);
  } finally { db.$client.close(); }
});

test('borrar el error, la sesión y el apunte deja cada extremo consistente', async ({ page }) => {
  const title = `Apunte de la cadena ${randomUUID().slice(0, 8)}`;
  const note = seedNote(title);
  const reference = `Cadena ${randomUUID().slice(0, 6)}`;

  // Una sesión propia con dos errores, creada como se crea de verdad.
  await page.goto('/registrar');
  await page.getByRole('button', { name: /Nueva sesión manual/u }).click();
  await page.getByLabel('Ítems intentados').fill('8');
  await page.getByLabel('Aciertos', { exact: true }).fill('5');
  await page.getByLabel('Referencia').fill(reference);
  await page.getByRole('button', { name: 'Crear sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir error' })).toBeVisible();
  const sessionId = Number(/[?&]s=(\d+)/u.exec(page.url())?.[1]);
  expect(Number.isSafeInteger(sessionId)).toBe(true);

  for (const [answer, rule] of [
    ['called off', 'call off es separable y admite pronombre en medio'],
    ['put off', 'put off necesita gerundio detras, no infinitivo'],
  ] as const) {
    await page.getByLabel('Enunciado', { exact: true }).fill(`They ______ the meeting. (${answer.toUpperCase()})`);
    await page.getByLabel('Corrección', { exact: true }).fill(answer);
    await page.getByLabel('Categoría', { exact: true }).selectOption('PHRASAL_VERB');
    await page.getByRole('textbox', { name: 'Regla', exact: true }).fill(rule);
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`Ver error: ${answer}`, 'u') })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Terminar' }).click();

  const db = createDb(E2E_DB);
  let firstErrorId: number;
  try {
    const errors = loadDataset(db).errors.filter((error) => error.sessionId === sessionId);
    expect(errors).toHaveLength(2);
    const at = new Date().toISOString();
    for (const error of errors) setErrorNoteLink(db, { errorId: error.id, noteId: note.id, headingSlug: null }, at);
    firstErrorId = errors[0]!.id;
  } finally { db.$client.close(); }

  const reader = notebookNoteHref(note);
  const related = page.getByRole('region', { name: 'Errores relacionados' });
  await page.goto(reader);
  await expect(related.getByRole('listitem')).toHaveCount(2);

  // Borrar un error se lleva su vínculo, no el apunte.
  await page.goto(`/errores?error=${String(firstErrorId)}`);
  const panel = page.getByRole('complementary', { name: 'Detalle del error' });
  await panel.getByRole('button', { name: 'Editar error' }).click();
  await panel.getByRole('button', { name: 'Borrar error…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar error' }).click();
  await page.goto(reader);
  await expect(related.getByRole('listitem')).toHaveCount(1);

  // Borrar la sesión se lleva el error que quedaba, y con él su vínculo.
  await page.goto(`/registrar?s=${String(sessionId)}`);
  await page.getByRole('button', { name: 'Más acciones de la sesión' }).click();
  await page.getByRole('menuitem', { name: 'Borrar sesión…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar sesión' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(reference, 'u') })).toHaveCount(0);

  await page.goto(reader);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(related.getByText('Ningún error apunta todavía a este apunte.')).toBeVisible();
  await expect(page.getByText('Texto del apunte.')).toBeVisible();

  // Y borrar el apunte deja al error sin vínculo y su dirección sin página.
  const survivor = seedError('fail-4', 'la corrección que sobrevive');
  try {
    const linkDb = createDb(E2E_DB);
    try {
      setErrorNoteLink(linkDb, { errorId: survivor.id, noteId: note.id, headingSlug: null }, new Date().toISOString());
    } finally { linkDb.$client.close(); }
    await page.goto(`/errores?error=${String(survivor.id)}`);
    await expect(page.getByRole('region', { name: 'Apuntes vinculados' }).getByRole('link', { name: title })).toBeVisible();

    cleanUp({ noteIds: [note.id] });

    await page.goto(`/errores?error=${String(survivor.id)}`);
    await expect(page.getByRole('region', { name: 'Apuntes vinculados' })
      .getByText('Este error aún no tiene apuntes vinculados.')).toBeVisible();
    await page.goto(reader);
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  } finally {
    cleanUp({ errorIds: [survivor.id], noteIds: [note.id] });
  }
});
