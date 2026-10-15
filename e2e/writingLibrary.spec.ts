import { randomUUID } from 'node:crypto';

import { type Page, expect, test } from '@playwright/test';
import { and, inArray, isNotNull, isNull, like } from 'drizzle-orm';

import { createDb } from '../src/lib/db/client';
import { session, writingPiece } from '../src/lib/db/schema';
import { applyWritingImport, previewWritingImport } from '../src/lib/db/writingRepo';
import { getMessages } from '../src/lib/i18n';
import { toIsoDate } from '../src/lib/time/dates';
import { ESSAY_TEXT, essayImport, uncorrectedImport } from '../src/lib/writing/fixtures';
import { E2E_DB } from './globalSetup';

function withDb<T>(run: (db: ReturnType<typeof createDb>) => T): T {
  const db = createDb(E2E_DB);
  try { return run(db); } finally { db.$client.close(); }
}

/** Guarda una redacción nueva, como si se hubiera importado desde la pantalla. */
function importPiece(value: unknown): number {
  return withDb((db) => {
    const source = JSON.stringify(value);
    const context = { today: toIsoDate(new Date()), t: getMessages('es') };
    // Siempre nueva: un texto parecido de otra prueba no debe proponerse como destino.
    const seen = previewWritingImport(db, source, { decision: { mode: 'create' }, writtenOn: null }, context);
    if (!seen.ok) throw new Error(JSON.stringify(seen.issues));
    const done = applyWritingImport(db, source, {
      importId: randomUUID(), decision: { mode: 'create' }, writtenOn: null, sessionSource: 'ACADEMIA', sessionId: null,
      digest: seen.digest,
    }, { ...context, now: new Date() });
    if (!done.ok) throw new Error(`No se pudo importar: ${JSON.stringify(done)}`);
    return done.pieceId;
  });
}

/** Tres redacciones propias de la prueba: un essay corregido, una review pendiente y un report flojo. */
function shelf(tag: string) {
  const essay = essayImport();
  Object.assign(essay.writing, { title: `Cities ${tag}`, text: `${ESSAY_TEXT}\n\nReference ${tag}.` });

  const review = uncorrectedImport();
  Object.assign(review.writing, {
    title: `Café review ${tag}`, type: 'REVIEW', writtenOn: '2026-10-05', taskPrompt: null,
    text: `The café on the corner is a naïve-${tag} delight.\n\nI would recommend it to anyone.`,
  });

  const report = essayImport();
  Object.assign(report.writing, {
    title: `Sports centre ${tag}`, type: 'REPORT', writtenOn: '2026-09-20', taskPrompt: null,
    text: `Introduction\n\nThe aim of this report ${tag} is to evaluate the sports centre.`,
  });
  Object.assign(report.assessment, {
    scores: { content: 2, communicativeAchievement: 2, organisation: 2, language: 2 }, total: null, teacherComment: null,
  });
  report.annotations = [];

  return { essay: importPiece(essay), review: importPiece(review), report: importPiece(report) };
}

function cleanUp(tag: string) {
  withDb((db) => {
    const sessions = db.select({ id: writingPiece.sessionId }).from(writingPiece).where(like(writingPiece.title, `%${tag}%`)).all();
    if (sessions.length > 0) db.delete(session).where(inArray(session.id, sessions.map((row) => row.id))).run();
  });
}

async function selectText(page: Page, quote: string) {
  await page.evaluate((value) => {
    const root = document.querySelector('[data-reading-mode]');
    if (root === null) throw new Error('No se encuentra el texto');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
      const offset = node.textContent?.indexOf(value) ?? -1;
      if (offset >= 0) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + value.length);
        const selected = window.getSelection();
        selected?.removeAllRanges();
        selected?.addRange(range);
        node.parentElement?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
      node = walker.nextNode();
    }
    throw new Error(`No se encontró el texto: ${value}`);
  }, quote);
}

const entries = (page: Page) => page.getByRole('list', { name: /^\d+ redacci/ });

/** Abrir y cerrar un menú exige que los manejadores de cliente ya estén hidratados. */
async function waitForClient(page: Page) {
  await page.getByRole('button', { name: /^Tipo: / }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

test('la biblioteca busca en título y texto, filtra por estado y tipo y ordena', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    shelf(tag);
    await page.goto(`/writing?q=${tag}`);
    // De más reciente a más antigua, con sus datos debajo del título y la nota a la derecha.
    await expect(entries(page).getByRole('link')).toHaveText([`Café review ${tag}`, `Cities ${tag}`, `Sports centre ${tag}`]);
    const essayRow = entries(page).getByRole('listitem').filter({ hasText: `Cities ${tag}` });
    await expect(essayRow).toContainText('Essay');
    await expect(essayRow).toContainText('2 oct 2026');
    await expect(essayRow).toContainText('8 por revisar');
    await expect(essayRow).toContainText('12,5/20');
    const reviewRow = entries(page).getByRole('listitem').filter({ hasText: `Café review ${tag}` });
    await expect(reviewRow).toContainText('Pendiente de corrección');
    await expect(reviewRow).toContainText('Sin nota');

    const status = page.getByRole('navigation', { name: 'Estado' });
    await status.getByRole('link', { name: 'Pendientes (1)' }).click();
    await expect(page).toHaveURL(new RegExp(`/writing\\?q=${tag}&estado=pendientes$`, 'u'));
    await expect(entries(page).getByRole('link')).toHaveText([`Café review ${tag}`]);
    await status.getByRole('link', { name: 'Corregidas (2)' }).click();
    await expect(entries(page).getByRole('link')).toHaveText([`Cities ${tag}`, `Sports centre ${tag}`]);

    await page.getByRole('button', { name: 'Tipo: Todos los tipos' }).click();
    await page.getByRole('menuitem', { name: 'Report' }).click();
    await expect(page).toHaveURL(new RegExp(`tipo=REPORT`, 'u'));
    await expect(entries(page).getByRole('link')).toHaveText([`Sports centre ${tag}`]);
    await page.getByRole('button', { name: 'Tipo: Report' }).click();
    await page.getByRole('menuitem', { name: 'Review' }).click();
    await expect(page.getByText('Ninguna redacción coincide con la búsqueda.')).toBeVisible();
    await page.getByRole('link', { name: 'Limpiar filtros' }).click();
    await expect(page).toHaveURL('/writing');

    await page.goto(`/writing?q=${tag}`);
    await page.getByRole('button', { name: 'Más recientes' }).click();
    await page.getByRole('menuitem', { name: 'Mejor nota' }).click();
    await expect(page).toHaveURL(new RegExp(`orden=nota`, 'u'));
    // Sin total al final: «sin nota» no es una nota baja.
    await expect(entries(page).getByRole('link')).toHaveText([`Cities ${tag}`, `Sports centre ${tag}`, `Café review ${tag}`]);
    await page.getByRole('button', { name: 'Mejor nota' }).click();
    await page.getByRole('menuitem', { name: 'Más antiguas' }).click();
    await expect(entries(page).getByRole('link')).toHaveText([`Sports centre ${tag}`, `Cities ${tag}`, `Café review ${tag}`]);

    // Al escribir filtra, también por el texto y sin acentos.
    await waitForClient(page);
    await page.getByRole('searchbox', { name: 'Buscar redacciones' }).fill(`naive-${tag}`);
    await expect(page).toHaveURL(new RegExp(`q=naive-${tag}`, 'u'));
    await expect(entries(page).getByRole('link')).toHaveText([`Café review ${tag}`]);
  } finally { cleanUp(tag); }
});

test('el lector enseña la redacción en su hoja, con el total arriba y la evaluación al pie', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    const { essay } = shelf(tag);
    await page.goto(`/writing?q=${tag}`);
    await entries(page).getByRole('link', { name: `Cities ${tag}` }).click();
    await expect(page).toHaveURL(`/writing/${String(essay)}-cities-${tag}`);

    const sheet = page.getByRole('article', { name: `Cities ${tag}` });
    await expect(sheet.getByRole('heading', { level: 1 })).toHaveText(`Cities ${tag}`);
    await expect(sheet.locator(':scope > header')).toContainText('12,5/20');
    await expect(sheet.getByRole('region', { name: 'Enunciado' })).toContainText('Write an essay discussing two of the measures');
    // Los párrafos, tal como se escribieron: errores incluidos.
    await expect(sheet.locator('p').filter({ hasText: 'there effect is more limited' })).toHaveCount(1);
    await expect(sheet.getByText(`Reference ${tag}.`, { exact: true })).toBeVisible();
    const assessment = sheet.getByRole('region', { name: 'Evaluación' });
    await expect(assessment).toContainText('Language');
    await expect(assessment).toContainText('2,5');
    await expect(assessment).toContainText('Corrector: Profesor');
    await expect(assessment).toContainText('Paragraph 3 has a lot of basic grammar');

    await page.getByRole('link', { name: 'Volver a Writing' }).click();
    await expect(page).toHaveURL('/writing');
  } finally { cleanUp(tag); }
});

test('el lector filtra anotaciones, las recorre con teclado y abre el panel móvil', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    const { essay } = shelf(tag);
    await page.goto(`/writing/${String(essay)}-cities-${tag}`);
    await expect(page.getByText(/\d+ palabras? · 220–260/u)).toBeVisible();
    const marked = page.getByRole('region', { name: 'Con anotaciones' }).getByText('there', { exact: true });
    await expect(marked).toHaveAttribute('role', 'button');
    await marked.click();
    const panel = page.getByRole('dialog', { name: 'Anotaciones' });
    await expect(panel).toBeVisible();
    const annotations = panel.getByRole('listbox').getByRole('option');
    await expect(annotations).toHaveCount(8);
    await annotations.filter({ hasText: 'Possessive.' }).click();
    await expect(annotations.filter({ hasText: 'Possessive.' })).toHaveAttribute('aria-selected', 'true');

    await panel.getByLabel('Tipo de anotación').selectOption('STRENGTH');
    await expect(annotations).toHaveCount(2);
    await panel.getByLabel('Tipo de anotación').selectOption('ALL');
    await panel.getByLabel('Solo pendientes').check();
    await expect(annotations).toHaveCount(8);
    await page.keyboard.press('ArrowUp');
    await expect(annotations.filter({ hasText: 'Needs work.' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    await page.getByRole('button', { name: 'Limpio' }).click();
    await expect(page.locator('[data-reading-mode="clean"]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Anotaciones (8)' }).click();
    await expect(page.getByRole('dialog', { name: 'Anotaciones' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Anotaciones' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { cleanUp(tag); }
});

test('crear, editar, revisar, borrar y deshacer anotaciones; colocar una cita sin ancla', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    const { essay } = shelf(tag);
    await page.goto(`/writing/${String(essay)}-cities-${tag}`);
    await selectText(page, 'although both measures are valuable');
    await page.getByRole('button', { name: 'Anotar selección', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Anotar selección' });
    await editor.getByLabel('Comentario').fill(`Created ${tag}`);
    await editor.getByRole('button', { name: 'Guardar anotación' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Anotación guardada.' })).toBeVisible();

    const panel = page.getByRole('region', { name: 'Anotaciones' });
    const note = panel.getByRole('listbox').locator('li').filter({ hasText: `Created ${tag}` });
    await expect(note).toBeVisible();
    await note.getByRole('button', { name: 'Editar anotación' }).click();
    const edit = page.getByRole('region', { name: 'Editar anotación' });
    await edit.getByLabel('Comentario').fill(`Edited ${tag}`);
    await edit.getByRole('button', { name: 'Guardar anotación' }).click();
    await expect(panel.getByRole('listbox').locator('li').filter({ hasText: `Edited ${tag}` })).toBeVisible();

    const edited = panel.getByRole('listbox').locator('li').filter({ hasText: `Edited ${tag}` });
    await edited.getByRole('button', { name: 'Marcar como estudiada' }).click();
    await expect(edited).toContainText('Estudiada');
    await edited.getByRole('button', { name: 'Borrar anotación' }).click();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(panel.getByRole('listbox').locator('li').filter({ hasText: `Edited ${tag}` })).toBeVisible();

    const pending = essayImport();
    Object.assign(pending.writing, { title: `Unplaced ${tag}`, text: 'The word is unclear.' });
    pending.annotations = [{ kind: 'ERROR', focus: 'GRAMMAR', source: 'PROFESOR', target: { scope: 'SPAN', quote: 'missingword' }, comment: 'Place this.', suggestion: null }];
    const unplacedId = importPiece(pending);
    await page.goto(`/writing/${String(unplacedId)}-unplaced-${tag}`);
    const placePanel = page.getByRole('region', { name: 'Anotaciones' });
    await placePanel.getByRole('option').filter({ hasText: 'Place this.' }).click();
    await selectText(page, 'unclear');
    await page.getByRole('button', { name: 'Colocar aquí', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Anotaciones' }).getByRole('option').filter({ hasText: 'unclear' })).toBeVisible();
  } finally { cleanUp(tag); }
});

test('un texto antiguo sin transcripción conserva su sitio en la biblioteca y su evaluación', async ({ page }) => {
  const legacy = withDb((db) => db.select().from(writingPiece)
    .where(and(isNull(writingPiece.originalText), isNotNull(writingPiece.rewriteOf))).get());
  if (legacy === undefined) throw new Error('El seed debe incluir una reescritura sin transcripción');

  await page.goto(`/writing?q=${encodeURIComponent('urban transport (rewrite)')}`);
  const row = entries(page).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Sin transcripción');
  await expect(row).toContainText('Reescritura');
  await row.getByRole('link').click();

  await expect(page).toHaveURL(`/writing/${String(legacy.id)}`);
  const sheet = page.getByRole('article', { name: 'Essay: urban transport (rewrite)' });
  await expect(sheet).toContainText('Sin transcripción');
  await expect(sheet).toContainText('Reescritura de Essay: urban transport');
  await expect(sheet.getByRole('region', { name: 'Evaluación' })).toContainText('Content');
});

test('G W lleva a Writing desde otra sección', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /^Buscar \(/ }).click();
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  await page.keyboard.press('Escape');
  const writing = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Writing', exact: true });
  await writing.focus();
  await page.keyboard.press('g');
  await page.keyboard.press('w');
  await expect(page).toHaveURL(/\/writing$/);
  await expect(writing).toHaveAttribute('aria-current', 'page');
});

test('en el móvil la biblioteca y el lector se leen sin desplazamiento horizontal', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    const { essay } = shelf(tag);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of [`/writing?q=${tag}`, `/writing/${String(essay)}`]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} desborda ${String(overflow)}px a ${String(width)} px`).toBeLessThanOrEqual(0);
      }
      const writing = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Writing', exact: true });
      expect(await writing.evaluate((element) => element.scrollWidth <= element.clientWidth), `Writing recortado a ${String(width)} px`).toBe(true);
    }
  } finally { cleanUp(tag); }
});
