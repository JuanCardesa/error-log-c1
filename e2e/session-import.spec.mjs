import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { rcfActivityPage } from '../tools/macmillan-capture/e2e/rcf-fixture.mjs';
import { parseImportedBatch } from '../src/lib/import/errors';
import { createDb } from '../src/lib/db/client';
import { countSessions, getSession, listErrors } from '../src/lib/db/repo';
import { E2E_DB } from './globalSetup';

const script = readFileSync('tools/macmillan-capture/dist/errorlog-macmillan.user.js', 'utf8');
const session = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: 'Importación sobre e2e', itemsTotal: 8, itemsCorrect: 6, timed: false };
const row = { prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };
function withDb(read) { const db = createDb(E2E_DB); try { return read(db); } finally { db.$client.close(); } }

const workspace = (page) => page.getByRole('region', { name: 'Revisar importación' });
const headerEditor = (page) => page.getByRole('region', { name: 'Datos de la sesión nueva' });

async function preview(page, envelope) {
  await page.goto('/registrar');
  await page.getByLabel('Pegar correcciones').fill(typeof envelope === 'string' ? envelope : JSON.stringify(envelope));
  await page.getByRole('button', { name: 'Revisar importación' }).click();
}

async function pickCategory(page, text) {
  const category = workspace(page).getByRole('combobox', { name: 'Categoría' });
  await category.click();
  await category.fill(text);
  await page.keyboard.press('Enter');
}

test('round-trip del userscript real: varias actividades, vista previa editable y sesión atómica', async ({ page }) => {
  await page.route('https://mee.macmillaneducation.com/**', (route) => {
    const second = route.request().url().endsWith('segunda');
    const html = rcfActivityPage({ activityId: second ? 'act-dos' : 'act-uno',
      ...(second ? { items: [{ ref: '1', lines: ['draw a'], id: 'one', answer: 'conclusion', verdict: 'correct' }] } : {}),
    }).replace('<body>', `<body><span data-book-title="Ready for C1 Advanced"></span><span data-page-number="${second ? 7 : 6}"></span><span data-activity-number="${second ? 2 : 1}"></span>`);
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  for (const path of ['primera', 'segunda']) {
    await page.goto(`https://mee.macmillaneducation.com/${path}`);
    await page.addScriptTag({ content: script });
    await page.getByRole('button', { name: /Error Log/ }).click();
  }
  await expect(page.locator('.counts')).toContainText('3 / 4 respuestas correctas');
  await page.getByRole('button', { name: 'Copiar tanda' }).click();
  const json = await page.getByLabel('Bloque para copiar').inputValue();
  const parsed = parseImportedBatch(json);
  expect(parsed.session).toMatchObject({ itemsTotal: 4, itemsCorrect: 3, sourceRef: 'Ready for C1 Advanced · págs. 6-7 · actividades 1-2' });
  expect(parsed.errors).toHaveLength(1);
  expect(parsed.session).not.toHaveProperty('durationMin');

  const before = withDb(countSessions);
  await preview(page, json);
  await expect(workspace(page)).toBeVisible();
  // La cabecera propuesta se resume y se edita a demanda.
  await expect(workspace(page)).toContainText('Ready for C1 Advanced · págs. 6-7 · actividades 1-2');
  await workspace(page).getByRole('button', { name: 'Editar sesión' }).click();
  await expect(headerEditor(page).getByRole('combobox', { name: 'Formato de examen' })).toHaveValue('');
  await expect(headerEditor(page).getByLabel('Ítems intentados')).toHaveValue('4');
  await headerEditor(page).getByLabel('Tipo').selectOption('CLASE');
  await headerEditor(page).getByText('Tiempo y duración').click();
  await headerEditor(page).getByLabel('Duración (min)').fill('17');
  await headerEditor(page).getByLabel('Cronometrada').check();

  const correct = workspace(page).getByRole('textbox', { name: 'Corrección', exact: true });
  await expect(correct).toHaveValue('');
  await correct.fill('compliment');
  await pickCategory(page, 'Coloca');
  await workspace(page).getByRole('textbox', { name: 'Regla', exact: true }).fill('Pay a compliment se usa para hacer un cumplido.');
  await workspace(page).getByRole('button', { name: /^Crear sesión y guardar 1 error/ }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  await expect(page.getByRole('status').filter({ hasText: 'Sesión creada con 1 error' })).toBeVisible();
  const id = Number(new URL(page.url()).searchParams.get('s'));
  expect(withDb(countSessions)).toBe(before + 1);
  expect(withDb((db) => getSession(db, id))).toMatchObject({ kind: 'CLASE', durationMin: 17, timed: true, itemsTotal: 4, itemsCorrect: 3, paper: null, part: null, status: 'OPEN' });
  expect(withDb((db) => listErrors(db, id))).toHaveLength(1);
});

test('un error inválido no crea sesión; conserva la revisión y permite corregirla', async ({ page }) => {
  const before = withDb(countSessions);
  await preview(page, { session, errors: [row, { ...row, itemRef: '2', ruleNote: row.correctAnswer.repeat(8), correctAnswer: row.correctAnswer.repeat(8) }] });
  await workspace(page).getByRole('button', { name: /^Crear sesión y guardar 2 errores/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha creado ninguna sesión' })).toBeVisible();
  expect(withDb(countSessions)).toBe(before);
  // La fila rechazada queda elegida para corregirla.
  await expect(workspace(page).getByRole('heading', { name: 'Error 2 de 2' })).toBeVisible();
  await workspace(page).getByRole('textbox', { name: 'Regla', exact: true }).fill('La partícula off indica la cancelación de la actividad.');
  await workspace(page).getByRole('button', { name: /^Crear sesión y guardar 2 errores/ }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  expect(withDb(countSessions)).toBe(before + 1);
});

test('ofrece añadir a una abierta sin reemplazar su cabecera ni sumar los recuentos', async ({ page }) => {
  await preview(page, { session, errors: [] });
  await workspace(page).getByRole('button', { name: /^Crear sesión sin errores/ }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  const id = Number(new URL(page.url()).searchParams.get('s'));
  const header = withDb((db) => getSession(db, id));
  const before = withDb(countSessions);
  await preview(page, { session: { ...session, itemsTotal: 99, itemsCorrect: 98, sourceRef: 'No sustituir' }, errors: [row] });
  await workspace(page).getByRole('button', { name: 'Cambiar destino' }).click();
  await workspace(page).getByLabel('Destino de la tanda').selectOption(String(id));
  await expect(workspace(page).getByText('no sustituye ni suma los recuentos', { exact: false })).toBeVisible();
  await expect(workspace(page)).toContainText('no cambian');
  await workspace(page).getByRole('button', { name: /^Guardar 1 error en esta sesión/ }).click();
  await expect(page).toHaveURL(new RegExp(`registrar\\?s=${id}`));
  await expect(page.getByRole('status').filter({ hasText: '1 error guardado.' })).toBeVisible();
  expect(withDb(countSessions)).toBe(before);
  expect(withDb((db) => getSession(db, id))).toEqual(header);
  expect(withDb((db) => listErrors(db, id))).toHaveLength(1);
});

test('explica un sobre manipulado sin preparar una vista previa falsa', async ({ page }) => {
  await preview(page, { session: { ...session, status: 'CLOSED' }, errors: [row] });
  await expect(page.getByRole('alert').filter({ hasText: 'Sobre inválido' })).toContainText('campos no permitidos (status)');
  await expect(workspace(page)).toHaveCount(0);
});

test('un bloque con solo errores abre la revisión y pide completar la sesión nueva', async ({ page }) => {
  const before = withDb(countSessions);
  await preview(page, { errors: [row] });
  await expect(workspace(page)).toBeVisible();
  await expect(workspace(page)).toContainText('Destino: sesión nueva');
  // Sin cabecera, faltan ítems y aciertos: el editor de la sesión se abre solo.
  await expect(headerEditor(page)).toBeVisible();
  await headerEditor(page).getByLabel('Ítems intentados').fill('6');
  await headerEditor(page).getByLabel('Aciertos', { exact: true }).fill('5');
  await headerEditor(page).getByLabel('Referencia').fill('Solo errores, sesión completada');
  await workspace(page).getByRole('button', { name: /^Crear sesión y guardar 1 error/ }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  expect(withDb(countSessions)).toBe(before + 1);
  const id = Number(new URL(page.url()).searchParams.get('s'));
  expect(withDb((db) => getSession(db, id))).toMatchObject({ itemsTotal: 6, itemsCorrect: 5, sourceRef: 'Solo errores, sesión completada' });
});

test('confirma una tanda sin errores y no repite el aviso al recargar', async ({ page }) => {
  await preview(page, { session, errors: [] });
  await expect(workspace(page)).toContainText('Esta tanda no contiene errores. La sesión contará igualmente');
  await workspace(page).getByRole('button', { name: /^Crear sesión sin errores/ }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Sesión creada con 0 errores' });
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL(/registrar\?s=\d+$/);
  await page.reload();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText('Sesión sin errores: 6 de 8 aciertos.', { exact: false })).toBeVisible();
});
