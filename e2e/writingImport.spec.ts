import { randomUUID } from 'node:crypto';

import { type Page, expect, test } from '@playwright/test';
import { eq, inArray, like } from 'drizzle-orm';

import { createDb } from '../src/lib/db/client';
import { session, writingAnnotation, writingPiece } from '../src/lib/db/schema';
import { applyWritingImport, previewWritingImport } from '../src/lib/db/writingRepo';
import { getMessages } from '../src/lib/i18n';
import { toIsoDate } from '../src/lib/time/dates';
import { ESSAY_TEXT, essayImport, uncorrectedImport } from '../src/lib/writing/fixtures';
import { E2E_DB } from './globalSetup';

/** Un título y un texto propios por prueba: ninguna reconoce como suya la redacción de otra. */
function unique<T extends ReturnType<typeof essayImport> | ReturnType<typeof uncorrectedImport>>(value: T, tag: string): T {
  value.writing['title'] = `Cities ${tag}`;
  value.writing['text'] = `${ESSAY_TEXT}\n\nReference ${tag} for this test only.`;
  return value;
}

function withDb<T>(run: (db: ReturnType<typeof createDb>) => T): T {
  const db = createDb(E2E_DB);
  try { return run(db); } finally { db.$client.close(); }
}

/** Al confirmar se abre el lector de la redacción: `/writing/<id>-<título>`. */
const readerUrl = (slug: string) => new RegExp(`/writing/\\d+-${slug}$`, 'u');

const piecesTitled = (tag: string) => withDb((db) => db.select().from(writingPiece).where(like(writingPiece.title, `%${tag}%`)).all());

/** Borra lo creado: la sesión arrastra su redacción y sus anotaciones. */
function cleanUp(tag: string) {
  withDb((db) => {
    const sessions = db.select({ id: writingPiece.sessionId }).from(writingPiece).where(like(writingPiece.title, `%${tag}%`)).all();
    if (sessions.length > 0) db.delete(session).where(inArray(session.id, sessions.map((row) => row.id))).run();
  });
}

async function openImport(page: Page) {
  await page.goto('/writing/importar');
  await expect(page.getByRole('heading', { level: 1, name: 'Importar Writing' })).toBeVisible();
  // Hasta hidratar el área de texto está desactivada: lo tecleado antes se perdería.
  await expect(page.getByLabel('JSON de la IA')).toBeEnabled();
}

async function review(page: Page, json: unknown) {
  await page.getByLabel('JSON de la IA').fill(typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  await page.getByRole('button', { name: 'Revisar importación' }).click();
}

test('importa un JSON corregido desde Writing: vista previa, confirmación y texto intacto', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const value = unique(essayImport(), tag);
  try {
    await page.goto('/writing');
    await page.getByRole('link', { name: 'Importar Writing' }).click();
    await expect(page).toHaveURL('/writing/importar');
    await expect(page.getByLabel('JSON de la IA')).toBeEnabled();
    await review(page, value);

    const preview = page.getByRole('form', { name: 'Redacción nueva' });
    await expect(preview.getByRole('article', { name: 'Texto original' })).toContainText('there effect is more limited');
    await expect(preview.getByRole('region', { name: 'Evaluación' })).toContainText('12,5 / 20');
    await expect(preview.getByRole('region', { name: 'Evaluación' })).toContainText('Paragraph 3 has a lot of basic grammar');
    const annotations = preview.getByRole('region', { name: 'Anotaciones' });
    await expect(annotations).toContainText('5 colocadas en el texto');
    await expect(annotations).toContainText('2 sobre un párrafo entero');
    await expect(annotations).toContainText('1 sobre todo el texto');
    expect(piecesTitled(tag)).toEqual([]);

    await preview.getByRole('button', { name: 'Importar redacción' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Redacción importada' })).toBeVisible();
    // Termina en el lector, con el texto tal como llegó.
    await expect(page).toHaveURL(readerUrl(`cities-${tag}`));
    await expect(page.getByRole('heading', { level: 1, name: `Cities ${tag}` })).toBeVisible();
    await expect(page.getByText('there effect is more limited', { exact: false })).toBeVisible();

    const [piece] = piecesTitled(tag);
    expect(piece).toMatchObject({ originalText: value.writing['text'], status: 'CORRECTED', bandLanguage: 2.5, date: '2026-10-02' });
    withDb((db) => {
      expect(db.select().from(writingAnnotation).where(eq(writingAnnotation.pieceId, piece?.id ?? 0)).all()).toHaveLength(8);
      expect(db.select().from(session).where(eq(session.id, piece?.sessionId ?? 0)).get())
        .toMatchObject({ kind: 'WRITING', paper: 'WRITING', part: 1, status: 'CLOSED', source: 'ACADEMIA' });
    });
  } finally { cleanUp(tag); }
});

test('explica por qué un JSON no se puede importar, sin guardar nada', async ({ page }) => {
  const before = withDb((db) => db.select().from(writingPiece).all().length);
  await openImport(page);

  await review(page, 'Aquí tienes el JSON: {');
  const issues = page.getByRole('region', { name: 'Todavía no se puede importar el JSON' });
  await expect(issues).toContainText('Esto no es un JSON válido');

  await review(page, { format: 'error-log-writing', version: 1, writing: { title: '', type: 'STORY', text: 'Dear Sir,', author: 'yo' } });
  await expect(issues).toContainText('writing.title');
  await expect(issues).toContainText('writing.type');
  await expect(issues).toContainText('author');
  await expect(page.getByRole('button', { name: 'Importar redacción' })).toHaveCount(0);
  expect(withDb((db) => db.select().from(writingPiece).all().length)).toBe(before);
});

test('la corrección posterior actualiza la misma redacción y un doble clic no la duplica', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    // La primera importación, sin corregir, ya está hecha.
    withDb((db) => {
      const draft = JSON.stringify(unique(uncorrectedImport(), tag));
      const context = { today: toIsoDate(new Date()), t: getMessages('es') };
      const seen = previewWritingImport(db, draft, { writtenOn: null }, context);
      if (!seen.ok) throw new Error('El borrador debía ser válido');
      const done = applyWritingImport(db, draft, {
        importId: randomUUID(), decision: seen.plan.decision, writtenOn: null, sessionSource: 'ACADEMIA', sessionId: null,
        digest: seen.digest,
      }, { ...context, now: new Date() });
      if (!done.ok) throw new Error('La primera importación debía guardarse');
    });

    await openImport(page);
    await review(page, unique(essayImport(), tag));
    const preview = page.getByRole('form', { name: `Actualización de «Cities ${tag}»` });
    await expect(preview.getByText('Mismo texto que una redacción guardada.')).toBeVisible();
    const changes = preview.getByRole('region', { name: 'Cambios en la redacción guardada' });
    await expect(changes).toContainText('Language: — → 2,5');
    await expect(changes).toContainText('Estado: Pendiente de corrección → Corregida');

    await preview.getByRole('button', { name: 'Actualizar redacción' }).dblclick();
    await expect(page.getByRole('status').filter({ hasText: 'Redacción actualizada' })).toBeVisible();
    await expect(page).toHaveURL(readerUrl(`cities-${tag}`));

    const pieces = piecesTitled(tag);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ status: 'CORRECTED', correctedOn: '2026-10-09' });
    withDb((db) => {
      expect(db.select().from(writingAnnotation).where(eq(writingAnnotation.pieceId, pieces[0]?.id ?? 0)).all()).toHaveLength(8);
    });
  } finally { cleanUp(tag); }
});

test('sin fecha de escritura la pregunta y guarda la que se elige', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const value = unique(uncorrectedImport(), tag);
  value.writing['writtenOn'] = null;
  try {
    await openImport(page);
    await review(page, value);
    const preview = page.getByRole('form', { name: 'Redacción nueva' });
    const notices = preview.getByRole('region', { name: 'Antes de importar' });
    await expect(notices).toContainText('Sin fecha de escritura: se usa la de hoy');

    await preview.getByLabel('Fecha de escritura').fill('2026-10-01');
    await expect(notices).toHaveCount(0);
    await expect(preview.getByRole('region', { name: 'Datos' })).toContainText('1 oct 2026');
    await preview.getByRole('button', { name: 'Importar redacción' }).click();
    await expect(page).toHaveURL(readerUrl(`cities-${tag}`));
    expect(piecesTitled(tag)[0]).toMatchObject({ date: '2026-10-01', dateBasis: 'WRITTEN', status: 'AWAITING' });
  } finally { cleanUp(tag); }
});

test('ofrece las instrucciones para la IA y, sin IA, revisa un texto pegado', async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  try {
    await openImport(page);
    await page.getByText('Prepáralo con ChatGPT o Claude').click();
    const instructions = page.getByLabel('Instrucciones para la IA');
    await expect(instructions).toHaveValue(/"format": "error-log-writing"/u);
    await expect(instructions).toHaveValue(/PROFESOR es mi profesora/u);

    await page.getByText('¿Sin IA? Pega el texto').click();
    await page.getByLabel('Título', { exact: true }).fill(`Report ${tag}`);
    await page.getByLabel('Tipo', { exact: true }).selectOption('REPORT');
    await page.getByLabel('Texto', { exact: true }).fill('Introduction\n\nThe aim of this report is to evaluate   the sports centre.');
    await page.getByRole('button', { name: 'Revisar este texto' }).click();
    await expect(page.getByLabel('JSON de la IA')).toHaveValue(/"type": "REPORT"/u);

    const preview = page.getByRole('form', { name: 'Redacción nueva' });
    await expect(preview.getByRole('region', { name: 'Anotaciones' })).toContainText('Sin anotaciones.');
    await preview.getByRole('button', { name: 'Importar redacción' }).click();
    await expect(page).toHaveURL(readerUrl(`report-${tag}`));
    expect(piecesTitled(tag)[0]).toMatchObject({
      genre: 'REPORT', status: 'AWAITING', dateBasis: 'IMPORTED',
      originalText: 'Introduction\n\nThe aim of this report is to evaluate   the sports centre.',
    });
  } finally { cleanUp(tag); }
});
