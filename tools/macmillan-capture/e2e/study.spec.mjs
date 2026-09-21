import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { rcfActivityPage } from './rcf-fixture.mjs';

const script = readFileSync('tools/macmillan-capture/dist/errorlog-macmillan.user.js', 'utf8');
const origin = 'https://mee.macmillaneducation.com';
async function attach(frame) {
  await frame.addScriptTag({ content: script });
  await frame.getByRole('button', { name: /Errores/ }).click();
}
async function copy(frame) {
  await frame.getByRole('button', { name: 'Copiar todo' }).click();
  return JSON.parse(await frame.getByLabel('Bloque para copiar').inputValue());
}

test('comparte el contexto del visor y acumula actividades entre marcos sin perder recuentos', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/visor' ? '<span data-book-title="Ready for C1 Advanced"></span><span data-page-number="6"></span><iframe src="/act-1"></iframe>'
      : rcfActivityPage({ activityId: path, ...(path === '/act-2' ? { items: [{ ref: '1', lines: ['draw a'], id: 'a', answer: 'conclusion', verdict: 'correct' }] } : {}) })
        .replace('<body>', `<body><span data-activity-number="${path === '/act-1' ? 1 : 2}"></span>`);
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto(`${origin}/visor`);
  await page.addScriptTag({ content: script });
  let frame = page.frames().find((value) => value.url().endsWith('/act-1'));
  await attach(frame);
  await expect(frame.locator('.counts')).toContainText('3 respuestas comprobadas, 2 aciertos');
  await page.locator('[data-page-number]').evaluate((element) => element.setAttribute('data-page-number', '7'));
  // La segunda actividad se lee en otro marco ya abierto; el primero conserva estado.
  await page.evaluate(() => { const iframe = document.createElement('iframe'); iframe.src = '/act-2'; document.body.append(iframe); });
  await expect(page.frameLocator('iframe').nth(1).locator('.activity')).toBeVisible();
  frame = page.frames().find((value) => value.url().endsWith('/act-2'));
  await attach(frame);
  await expect(frame.locator('.counts')).toContainText('4 respuestas comprobadas, 3 aciertos');
  const block = await copy(frame);
  expect(block.session).toMatchObject({ itemsTotal: 4, itemsCorrect: 3, sourceRef: 'Ready for C1 Advanced · págs. 6-7 · actividades 1-2' });
  expect(block.errors).toHaveLength(1);
  const first = page.frames().find((value) => value.url().endsWith('/act-1'));
  await expect(first.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('vaciar reinicia recuentos; recargar no los resucita y la siguiente tanda empieza desde cero', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage({ activityId: new URL(route.request().url()).pathname }) }));
  await page.goto(`${origin}/uno`);
  await attach(page);
  await page.getByRole('button', { name: 'Vaciar la bandeja' }).click();
  await page.reload();
  await attach(page);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
  await expect(page.locator('.counts')).toBeHidden();
  await page.goto(`${origin}/dos`);
  await attach(page);
  const block = await copy(page);
  expect(block.session).toMatchObject({ itemsTotal: 3, itemsCorrect: 2 });
  expect(block.errors).toHaveLength(1);
});

test('más de cien fallos siguen siendo una sola sesión y una sola copia', async ({ page }) => {
  const items = Array.from({ length: 101 }, (_, i) => ({ ref: String(i + 1), lines: ['A'], id: `gap-${i}`, answer: 'x', verdict: 'incorrect' }));
  await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage({ items }) }));
  await page.goto(`${origin}/grande`);
  await attach(page);
  const block = await copy(page);
  expect(block.errors).toHaveLength(101);
  expect(block.session).toMatchObject({ itemsTotal: 101, itemsCorrect: 0 });
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('no atribuye a otro visor los metadatos que quedaron de una navegación anterior', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => {
    const known = route.request().url().endsWith('/con-contexto');
    const body = rcfActivityPage({ activityId: known ? 'known' : 'unknown' }).replace('<body>', known
      ? '<body><span data-book-title="Libro observado"></span><span data-page-number="6"></span>' : '<body>');
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto(`${origin}/con-contexto`);
  await attach(page);
  await copy(page);
  await page.goto(`${origin}/sin-contexto`);
  await attach(page);
  expect((await copy(page)).session.sourceRef).toBe(null);
});
