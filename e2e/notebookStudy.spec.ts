import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createDb } from '../src/lib/db/client';
import { createNotebookNote, getNotebookNote, listNotebookAnnotations, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookStudyText } from '../src/lib/notebook/studyMarkdown';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import type { NotebookNote } from '../src/lib/notebook/types';
import { E2E_DB } from './globalSetup';

const markdown = '## Regla\n\nAn **important concept** and [a link](https://example.com).\n\nAnother paragraph to study.\n\n- First item\n- Second item\n\n`excluded code`\n\nFinal paragraph.';
const text = notebookStudyText(markdown);
let note: NotebookNote;
test.beforeEach(async ({ page }) => {
  const db = createDb(E2E_DB);
  try { note = createNotebookNote(db, { uid: randomUUID(), title: `Folio ${randomUUID().slice(0, 8)}`,
    folderId: null, tags: [], contentMarkdown: markdown }, new Date().toISOString()).note; }
  finally { db.$client.close(); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(notebookNoteHref(note));
  await expect(page.getByText('Ningún error apunta todavía a este apunte.')).toBeVisible();
});

async function select(page: Page, quote: string, mouse = false) {
  const start = text.indexOf(quote);
  expect(start).toBeGreaterThanOrEqual(0);
  const points = await page.evaluate(({ start, end, mouse }) => {
    const root = document.querySelector<HTMLElement>('[data-study-content]')!;
    const spans = [...root.querySelectorAll<HTMLElement>('[data-study-start]')];
    function point(offset: number, end: boolean): [Node, number] {
      const span = spans.find((item) => {
        const from = Number(item.dataset['studyStart']);
        const to = from + item.textContent!.length;
        return end ? from < offset && to >= offset : from <= offset && to > offset;
      })!;
      let remaining = offset - Number(span.dataset['studyStart']);
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode()!;
      while (remaining > node.textContent!.length) { remaining -= node.textContent!.length; node = walker.nextNode()!; }
      return [node, remaining];
    }
    const [first, firstOffset] = point(start, false);
    const [last, lastOffset] = point(end, true);
    const range = document.createRange();
    range.setStart(first, firstOffset);
    range.setEnd(last, lastOffset);
    const head = range.cloneRange(); head.collapse(true);
    const tail = range.cloneRange(); tail.collapse(false);
    const a = head.getBoundingClientRect(); const b = tail.getBoundingClientRect();
    if (!mouse) {
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }
    return { a: { x: a.x, y: a.y + a.height / 2 }, b: { x: b.x, y: b.y + b.height / 2 } };
  }, { start, end: start + quote.length, mouse });
  if (mouse) {
    await page.mouse.move(points.a.x, points.a.y);
    await page.mouse.down();
    await page.mouse.move(points.b.x, points.b.y, { steps: 6 });
    await page.mouse.up();
  }
  await expect(page.getByRole('group', { name: 'Marcar texto', exact: true })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.getByText('Marcas guardadas', { exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Rotulador', exact: true })).toBeEnabled();
}
function marks() {
  const db = createDb(E2E_DB);
  try { return listNotebookAnnotations(db, note.id); } finally { db.$client.close(); }
}

test('ratón: rotulador y color persisten; limpiar respeta el resto de la selección', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Índice del apunte' })).toHaveCount(0);
  await select(page, 'An important concept', true);
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await page.getByRole('button', { name: 'Azul', exact: true }).click();
  await saved(page);
  await expect(page.locator('mark[data-study-color="blue"]')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/notebook-study.png', fullPage: true });
  await page.reload();
  await expect(page.getByText('Ningún error apunta todavía a este apunte.')).toBeVisible();
  await expect(page.locator('mark[data-study-color="blue"]')).toHaveCount(2);
  await select(page, 'important');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await saved(page);
  await expect(page.locator('mark[data-study-color="blue"]')).toHaveText(['An ', ' concept']);
  await page.reload();
  await expect(page.locator('mark[data-study-color="blue"]')).toHaveText(['An ', ' concept']);
  const db = createDb(E2E_DB);
  try { expect(getNotebookNote(db, note.id)?.contentMarkdown).toBe(markdown); } finally { db.$client.close(); }
});

test('selección entre párrafos, enlaces, listas y título; teclado, Escape y scroll', async ({ page }) => {
  await select(page, 'concept and a link.\nAnother paragraph');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Rotulador', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await saved(page);
  expect(marks()[0]?.anchor.exact).toBe('concept and a link.\nAnother paragraph');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Marcar texto', exact: true })).toHaveCount(0);
  await select(page, 'Regla');
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await page.getByRole('button', { name: 'Rojo', exact: true }).click();
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Regla' }).locator('[data-study-color="red"]')).toBeVisible();
  await select(page, 'First item\n\nSecond item');
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await saved(page);
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect(page.getByRole('group', { name: 'Marcar texto', exact: true })).toHaveCount(0);
  // El código queda fuera del sistema de marcas.
  await page.locator('code').evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(page.getByRole('group', { name: 'Marcar texto', exact: true })).toHaveCount(0);
});

test('fallo de red revierte la marca y permite reintentar', async ({ page }) => {
  let failed = false;
  await page.route('**/notebook/**', async (route) => {
    if (!failed && route.request().method() === 'POST' && route.request().postData()?.includes('anchor')) {
      failed = true; await route.abort('failed');
    } else await route.continue();
  });
  await select(page, 'important concept');
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await expect(page.locator('article').getByRole('alert')).toContainText('se ha revertido');
  await expect(page.locator('mark')).toHaveCount(0);
  expect(marks()).toEqual([]);
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await saved(page);
  await expect(page.locator('mark')).toHaveText(['important concept']);
});

test('una edición recoloca la marca y el borrado de texto la conserva con aviso', async ({ page }) => {
  await select(page, 'important concept');
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await saved(page);
  const db = createDb(E2E_DB);
  try {
    note = saveNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: note.title, folderId: null, tags: [], contentMarkdown: `Introduction.\n\n${markdown}` }, new Date().toISOString());
  } finally { db.$client.close(); }
  await page.reload();
  await expect(page.locator('mark')).toHaveText(['important concept']);
  const next = createDb(E2E_DB);
  try { saveNotebookNote(next, { id: note.id, uid: note.uid, expectedRevision: note.revision,
    title: note.title, folderId: null, tags: [], contentMarkdown: 'Changed note.' }, new Date().toISOString()); }
  finally { next.$client.close(); }
  await page.reload();
  await expect(page.getByText('1 marca no se ha podido recolocar', { exact: false })).toBeVisible();
  await expect(page.locator('mark')).toHaveCount(0);
  expect(marks()[0]?.orphaned).toBe(true);
});

test('paleta legible sobre papel y rotulador', async ({ page }) => {
  await select(page, 'important concept');
  await page.getByRole('button', { name: 'Rotulador', exact: true }).click();
  await saved(page);
  for (const label of ['Verde', 'Rojo', 'Azul', 'Naranja', 'Normal']) {
    await page.getByRole('button', { name: 'Color', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await saved(page);
    const contrast = await page.locator('mark').evaluate((element) => {
      function lum(color: string) {
        const values = color.match(/[\d.]+/gu)!.slice(0, 3).map(Number).map((n) => {
          const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
      }
      const style = getComputedStyle(element);
      const ink = lum(style.color); const yellow = lum(style.backgroundColor);
      return Math.min((yellow + 0.05) / (ink + 0.05), 1.05 / (ink + 0.05));
    });
    expect(contrast, label).toBeGreaterThanOrEqual(4.5);
  }
});
