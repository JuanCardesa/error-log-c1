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

test('no escribe los mismos recuentos cada vez que cambia el DOM', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage() }));
  await page.goto(`${origin}/estable`);
  await page.evaluate(() => {
    window.studyWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'errorlog-macmillan:study') window.studyWrites += 1;
      return original.call(this, key, value);
    };
  });
  await attach(page);
  expect(await page.evaluate(() => window.studyWrites)).toBe(1);
  for (let i = 0; i < 3; i += 1) {
    await page.locator('body').evaluate((body, value) => body.setAttribute('data-unrelated', String(value)), i);
    await page.waitForTimeout(450);
  }
  expect(await page.evaluate(() => window.studyWrites)).toBe(1);
  expect((await copy(page)).session).toMatchObject({ itemsTotal: 3, itemsCorrect: 2 });
});

test('un bloque demasiado largo queda accesible entero y no se marca como exportado', async ({ page }) => {
  const items = Array.from({ length: 300 }, (_, i) => ({ ref: String(i + 1), lines: ['x'.repeat(1000)], id: `gap-${i}`, answer: 'x', verdict: 'incorrect' }));
  await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage({ items }) }));
  await page.goto(`${origin}/demasiado-largo`);
  await attach(page);
  const block = await copy(page);
  await expect(page.getByLabel('Bloque para copiar')).toBeVisible();
  await expect(page.locator('.note')).toContainText('acorta los enunciados');
  expect(block.errors).toHaveLength(300);
  expect(block.errors[0].prompt).toContain('x'.repeat(1000));
  const stored = await page.evaluate(() => ({
    tray: JSON.parse(localStorage.getItem('errorlog-macmillan:tray')),
    study: JSON.parse(localStorage.getItem('errorlog-macmillan:study')),
    done: JSON.parse(localStorage.getItem('errorlog-macmillan:study-done') ?? '{}'),
  }));
  expect(stored.tray).toHaveLength(300);
  expect(stored.study.activities).toHaveLength(1);
  expect(stored.done).toEqual({});
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeEnabled();
});

test('un estado guardado con forma inesperada no impide arrancar ni pierde la tanda nueva', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage() }));
  await page.goto(`${origin}/corrupto`);
  const failures = [];
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  await page.evaluate(() => {
    localStorage.setItem('errorlog-macmillan:study', '{"activities":"bad"}');
    localStorage.setItem('errorlog-macmillan:study-done', 'null');
    localStorage.setItem('errorlog-macmillan:tray', '{}');
  });
  await attach(page);
  expect(failures).toEqual([]);
  await expect(page.locator('.counts')).toContainText('3 respuestas comprobadas, 2 aciertos');
  expect((await copy(page)).errors).toHaveLength(1);
});

for (const phase of ['arranque', 'sincronización']) {
  test(`conserva las filas válidas ante entradas corruptas de bandeja en ${phase}`, async ({ page }) => {
    await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: rcfActivityPage() }));
    await page.goto(`${origin}/bandeja-corrupta`);
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    if (phase === 'sincronización') await attach(page);
    await page.evaluate(() => {
      const valid = { mark: 'legacy-1', activityKey: 'legacy', row: {
        itemRef: '1', prompt: 'Saved prompt', myAnswer: 'wrong', correctAnswer: 'right', ruleNote: '', category: '', subcategory: '',
      } };
      localStorage.setItem('errorlog-macmillan:tray', JSON.stringify([
        null, {}, { ...valid, row: null }, { ...valid, row: [] }, { ...valid, row: { prompt: 42 } }, valid,
      ]));
    });
    if (phase === 'arranque') await attach(page);
    const exported = await copy(page);
    expect(failures).toEqual([]);
    // La fila antigua no tiene recuentos: se conserva el formato compatible anterior.
    expect(exported).toHaveLength(2);
    expect(exported[0]).toMatchObject({ prompt: 'Saved prompt', correctAnswer: 'right' });
  });
}

test('el visor que deja de mostrar libro y página retira su contexto en vez de prestarlo', async ({ page }) => {
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/visor'
      ? '<span data-book-title="Libro observado"></span><span data-page-number="6"></span><iframe src="/act-1"></iframe>'
      : rcfActivityPage({ activityId: path, ...(path === '/act-2' ? { items: [{ ref: '1', lines: ['draw a'], id: 'a', answer: 'conclusion', verdict: 'correct' }] } : {}) })
        .replace('<body>', `<body><span data-activity-number="${path === '/act-1' ? 1 : 2}"></span>`);
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto(`${origin}/visor`);
  await page.addScriptTag({ content: script });
  let frame = page.frames().find((value) => value.url().endsWith('/act-1'));
  await attach(frame);
  // Cambio de sitio dentro del mismo visor, sin recargar: ya no consta ni libro ni página.
  await page.evaluate(() => {
    document.querySelector('[data-book-title]')?.remove();
    document.querySelector('[data-page-number]')?.remove();
  });
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(':context:')).length)).toBe(0);
  await page.evaluate(() => { const child = document.createElement('iframe'); child.src = '/act-2'; document.body.append(child); });
  await expect(page.frameLocator('iframe').nth(1).locator('.activity')).toBeVisible();
  frame = page.frames().find((value) => value.url().endsWith('/act-2'));
  await attach(frame);
  const { sourceRef } = (await copy(frame)).session;
  expect(sourceRef).not.toContain('actividades 1-2');
  expect(sourceRef).toContain('Libro observado · págs. 6 · actividades 1');
});
