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

async function preview(page, envelope) {
  await page.goto('/registrar');
  await page.getByLabel('Sesión y errores para importar').fill(typeof envelope === 'string' ? envelope : JSON.stringify(envelope));
  await page.getByRole('button', { name: 'Revisar sesión y errores' }).click();
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
    await page.getByRole('button', { name: /Errores/ }).click();
  }
  await expect(page.locator('.counts')).toContainText('4 respuestas comprobadas, 3 aciertos');
  await page.getByRole('button', { name: 'Copiar todo' }).click();
  const json = await page.getByLabel('Bloque para copiar').inputValue();
  const parsed = parseImportedBatch(json);
  expect(parsed.session).toMatchObject({ itemsTotal: 4, itemsCorrect: 3, sourceRef: 'Ready for C1 Advanced · págs. 6-7 · actividades 1-2' });
  expect(parsed.errors).toHaveLength(1);
  expect(parsed.session).not.toHaveProperty('durationMin');

  const before = withDb(countSessions);
  await preview(page, json);
  const header = page.getByRole('group', { name: 'Cabecera propuesta' });
  await expect(header.getByRole('combobox', { name: 'Paper', exact: true })).toHaveValue('');
  await expect(header.getByLabel('Items *')).toHaveValue('4');
  await header.getByLabel('Tipo').selectOption('CLASE');
  await header.getByLabel('Minutos').fill('17');
  await header.getByLabel('Cronometrada').check();
  const error = page.getByRole('group', { name: 'Error 1', exact: true });
  await expect(error.getByLabel('Correcta *')).toHaveValue('');
  await error.getByLabel('Correcta *').fill('compliment');
  await error.getByLabel('Categoria *').fill('COLOCACION');
  await error.getByLabel('Regla, con tus palabras *').fill('Pay a compliment se usa para hacer un cumplido.');
  await page.getByRole('button', { name: 'Crear sesión y guardar 1 error', exact: true }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  const id = Number(new URL(page.url()).searchParams.get('s'));
  expect(withDb(countSessions)).toBe(before + 1);
  expect(withDb((db) => getSession(db, id))).toMatchObject({ kind: 'CLASE', durationMin: 17, timed: true, itemsTotal: 4, itemsCorrect: 3, paper: null, part: null, status: 'OPEN' });
  expect(withDb((db) => listErrors(db, id))).toHaveLength(1);
});

test('un error inválido no crea sesión; conserva la revisión y permite corregirla', async ({ page }) => {
  const before = withDb(countSessions);
  await preview(page, { session, errors: [row, { ...row, itemRef: '2', ruleNote: row.correctAnswer.repeat(8), correctAnswer: row.correctAnswer.repeat(8) }] });
  await page.getByRole('button', { name: 'Crear sesión y guardar 2 errores' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha creado ninguna sesión' })).toBeVisible();
  expect(withDb(countSessions)).toBe(before);
  const second = page.getByRole('group', { name: 'Error 2', exact: true });
  await second.getByLabel('Regla, con tus palabras *').fill('La partícula off indica la cancelación de la actividad.');
  await page.getByRole('button', { name: 'Crear sesión y guardar 2 errores' }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  expect(withDb(countSessions)).toBe(before + 1);
});

test('ofrece añadir a una abierta sin reemplazar su cabecera ni sumar los recuentos', async ({ page }) => {
  await preview(page, { session, errors: [] });
  await page.getByRole('button', { name: 'Crear sesión y guardar 0 errores' }).click();
  await expect(page).toHaveURL(/registrar\?s=\d+/);
  const id = Number(new URL(page.url()).searchParams.get('s'));
  const header = withDb((db) => getSession(db, id));
  const before = withDb(countSessions);
  await preview(page, { session: { ...session, itemsTotal: 99, itemsCorrect: 98, sourceRef: 'No sustituir' }, errors: [row] });
  await page.getByLabel('Destino de la tanda').selectOption(String(id));
  await expect(page.getByRole('status').filter({ hasText: 'no se suman automáticamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar 1 error', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`registrar\\?s=${id}$`));
  expect(withDb(countSessions)).toBe(before);
  expect(withDb((db) => getSession(db, id))).toEqual(header);
  expect(withDb((db) => listErrors(db, id))).toHaveLength(1);
});

test('explica un sobre manipulado sin preparar una vista previa falsa', async ({ page }) => {
  await preview(page, { session: { ...session, status: 'CLOSED' }, errors: [row] });
  await expect(page.getByRole('alert').filter({ hasText: 'Sobre inválido' })).toContainText('campos no permitidos (status)');
  await expect(page.getByRole('group', { name: 'Cabecera propuesta' })).toHaveCount(0);
});

test('un bloque con solo errors indica que hay que abrir una sesión', async ({ page }) => {
  await preview(page, { errors: [row] });
  await expect(page.getByRole('alert').filter({ hasText: 'Este bloque solo trae errores' })).toContainText('Abre una sesión y usa «Pegar varios errores»');
  await expect(page.getByRole('group', { name: 'Cabecera propuesta' })).toHaveCount(0);
});
