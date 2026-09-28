import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { FAKE_ANKI_PROFILE, FAKE_ANKI_URL } from './fakeAnki';
import { E2E_DB } from './globalSetup';
import { categoryLabel } from '../src/app/_shared/labels';

/**
 * Los flujos que solo se ven con Anki respondiendo: sincronizar, reintentar tras un
 * fallo y exportar lo sincronizado. Hablan con el doble que arranca Playwright.
 */

async function control(request: APIRequestContext, body: {
  failAction?: string | null; disconnected?: boolean;
  reviewsFor?: { cardId: number; ease: number; type: number };
}) {
  expect((await request.post(`${FAKE_ANKI_URL}/__control`, { data: body })).ok()).toBe(true);
}

/** El espejo es estado compartido entre specs: cada test parte y deja la base sin él. */
function clearMirror(): void {
  const db = createDb(E2E_DB);
  try {
    // Conversiones verificadas y marcas a mano: ambas salen de estos tests, y el espejo
    // entero. `report.spec.ts` marca a mano tambien, pero corre despues y parte de cero.
    db.$client.exec(`
      UPDATE error_row SET anki_added = 0, anki_added_at = NULL, anki_content_hash = NULL;
      DELETE FROM anki_review; DELETE FROM anki_card; DELETE FROM anki_note; DELETE FROM anki_sync;
    `);
  } finally {
    db.$client.close();
  }
}

async function reset(request: APIRequestContext): Promise<void> {
  await control(request, { failAction: null, disconnected: false });
  clearMirror();
}

test.beforeEach(async ({ request }) => { await reset(request); });
// También al salir: el siguiente spec da por hecho que Anki responde y no hay espejo.
test.afterEach(async ({ request }) => { await reset(request); });

const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });
const create = (page: Page) => page.getByRole('button', { name: /^(Crear en Anki|Verificando…)$/ });
const pendingCount = async (page: Page) => Number((await page.getByText(/^\d+ pendientes$/).innerText()).split(' ')[0]);
const stat = (page: Page, name: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${name}`) }).locator('+ dd');
const converted = (page: Page) => page.getByRole('region', { name: 'Convertidas', exact: true });

/** Crea la tarjeta de la seleccionada y espera a que se verifique. */
async function createCard(page: Page) {
  await create(page).click();
  await expect(toast(page, /creada y verificada en Anki/)).toBeVisible();
}

/** Abre el panel de un error de la sesión, por su corrección, y entra a editarlo. */
async function editInSession(page: Page, sessionId: number, correct: string) {
  await page.goto(`/registrar?s=${String(sessionId)}`);
  const escaped = correct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(`Ver error.*: ${escaped}`) }).first().click();
  const panel = page.getByRole('complementary', { name: 'Detalle del error' });
  await panel.getByRole('button', { name: 'Editar error' }).click();
  return panel;
}

test('sincroniza, refleja los repasos y no los duplica al repetir', async ({ page }) => {
  await page.goto('/anki');
  await expect(page.getByText('Disponible', { exact: true })).toBeVisible();
  await page.getByText('Conexión y cómo conectar Anki').click();
  await expect(page.getByText(`Anki conectado · perfil ${FAKE_ANKI_PROFILE}`)).toBeVisible();
  await expect(create(page)).not.toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, 'Sincronizado: 4 repasos nuevos; 4 en el historial,')).toBeVisible();
  // El aviso dice de cuánto se ha leído, para que el resultado sea proporcional.
  await expect(toast(page, 'de 3 cartas y 3 notas leídas')).toBeVisible();
  // Anki no expone su corte, así que se supone 4:00 y se dice que es una suposición.
  await expect(page.getByText('se supone que empieza a las 4:00', { exact: false })).toBeVisible();
  await expect(page.getByText('ponla en ANKI_ROLLOVER_HOUR', { exact: false })).toBeVisible();

  // Cuatro repasos: un lapso, un «Again» aprendiendo, dos aciertos, tres cartas distintas.
  await page.getByRole('link', { name: 'Repasos', exact: true }).click();
  await expect(stat(page, 'repasos')).toHaveText('4');
  await expect(stat(page, 'lapsos')).toHaveText('1');
  await expect(stat(page, 'fallos aprendiendo')).toHaveText('1');
  await page.getByText('Qué es un fallo y un lapso, y otras cifras').click();
  await expect(page.getByText('cartas distintas repasadas: 3', { exact: false })).toBeVisible();
  // Las notas que fallan se leen al desplegar su categoría.
  await page.locator('details').filter({ hasText: 'deal with' }).locator('summary').click();
  await expect(page.getByText('deal with')).toBeVisible();

  // Repetir sin estudiar no inventa repasos nuevos ni duplica el historial.
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, 'Sincronizado: 0 repasos nuevos; 4 en el historial,')).toBeVisible();
});

test('un fallo de Anki se explica y el reintento posterior funciona', async ({ page, request }) => {
  await control(request, { failAction: 'findCards' });
  await page.goto('/anki?tab=repasos');
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, 'Fallo simulado')).toBeVisible();
  // Un intento fallido no deja el espejo a medias.
  await expect(page.getByText('Sincroniza Anki para consultar tus repasos.', { exact: false })).toBeVisible();

  await control(request, { failAction: null });
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, '4 repasos nuevos')).toBeVisible();
});

test('Anki cerrado se explica sin fingir que no hay fallos', async ({ page, request }) => {
  await control(request, { disconnected: true });
  await page.goto('/anki');
  await expect(page.getByText('No disponible', { exact: true })).toBeVisible();
  await expect(page.getByText('No se puede conectar', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Puedes seguir leyendo y editando la cola.', { exact: false })).toBeVisible();

  // El botón sigue alcanzable y dice por qué no va.
  await expect(create(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(create(page)).toHaveAccessibleDescription(/Necesitas Anki abierto/);
  const before = await pendingCount(page);
  await create(page).click({ force: true });
  await expect(page.getByText(`${String(before)} pendientes`, { exact: true })).toBeVisible();

  // Sin sincronizar, las cifras de repaso no son ceros.
  await page.getByRole('link', { name: 'Repasos', exact: true }).click();
  await expect(page.getByText('Todavía no hay datos importados: no son cero fallos.', { exact: false })).toBeVisible();
});

test('lo sincronizado sale en el CSV de Q7 y en el volcado JSON', async ({ page, request }) => {
  await page.goto('/anki');
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, '4 repasos nuevos')).toBeVisible();

  const csv = await request.get('/exportar/q7.csv');
  expect(csv.ok()).toBe(true);
  const text = await csv.text();
  expect(text).toContain('categoria,repasos,fallos,lapsos,fallos_aprendiendo,cartas_distintas,pct_aciertos');
  expect(text).toContain('PHRASAL_VERB');
  expect(text).toContain('COLOCACION');

  const dump = await (await request.get('/exportar/dump.json')).json() as {
    anki: { reviews: unknown[]; notes: unknown[] };
  };
  expect(dump.anki.reviews).toHaveLength(4);
  expect(dump.anki.notes).toHaveLength(3);
  // Las cifras se recalculan desde el espejo: el CSV de Q7 las trae ya hechas.
  expect(text).toContain('PHRASAL_VERB,2,1,1,0,1,50');
});

test('crear en Anki verifica la tarjeta y repetirlo no crea una segunda nota', async ({ page, request }) => {
  await page.goto('/anki');
  const before = await pendingCount(page);

  await createCard(page);
  // El aviso vive fuera de la cola: sobrevive a que el error salga de ella.
  await expect(page.getByText(`${String(before - 1)} pendientes`, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Convertidas', exact: true }).click();
  await expect(converted(page).getByText('Verificada', { exact: true }).first()).toBeVisible();

  // Devolver a pendientes desvincula y conserva la nota en Anki; volver a crearla debe
  // reencontrarla por su identidad en vez de añadir otra.
  await converted(page).getByRole('button', { name: 'Devolver a pendientes' }).first().click();
  await expect(toast(page, 'Devuelto a pendientes. La nota y su historial siguen en Anki.')).toBeVisible();
  await page.getByRole('link', { name: /^Pendientes/ }).click();
  await expect(page.getByText(`${String(before)} pendientes`, { exact: true })).toBeVisible();
  await createCard(page);
  await expect(page.getByText(`${String(before - 1)} pendientes`, { exact: true })).toBeVisible();

  const dump = await (await request.get('/exportar/dump.json')).json() as { anki: { notes: { model: string }[] } };
  expect(dump.anki.notes.filter((row) => row.model === 'Error Log C1')).toHaveLength(1);
});

test('corregir un error convertido avisa de que la tarjeta quedó vieja y deja arreglarla', async ({ page }) => {
  await page.goto('/anki');
  await createCard(page);

  // Se corrige el texto del error ya convertido.
  const db = createDb(E2E_DB);
  try {
    db.$client.exec(`UPDATE error_row SET correct_answer = 'texto corregido' WHERE anki_note_id IS NOT NULL`);
  } finally { db.$client.close(); }

  await page.goto('/anki?tab=convertidas');
  await expect(converted(page).getByText('Desactualizada', { exact: true }).first()).toBeVisible();
  await converted(page).getByRole('button', { name: 'Actualizar en Anki' }).first().click();
  await expect(toast(page, 'Tarjeta actualizada en Anki.')).toBeVisible();
  await page.reload();
  await expect(converted(page).getByText('Desactualizada', { exact: true })).toHaveCount(0);
  await expect(converted(page).getByText('Verificada', { exact: true }).first()).toBeVisible();
});

test('una conversion antigua que se corrige sigue teniendo boton para actualizarla', async ({ page, request }) => {
  // Solo se enseñan las ocho últimas conversiones: corregir una anterior no puede dejarla
  // desactualizada y sin ningún sitio desde el que arreglarla.
  await page.goto('/anki');
  const queue = page.getByRole('table', { name: /pendientes de tarjeta/ });
  const oldest = (await queue.locator('tbody tr').first().getByRole('button').innerText()).trim();

  for (let i = 0; i < 9; i += 1) {
    await createCard(page);
    await page.reload();
  }

  await page.goto('/anki?tab=convertidas');
  // La novena por antigüedad queda fuera del listado mientras no pida nada.
  await expect(converted(page).getByText(oldest, { exact: true })).toHaveCount(0);

  const dump = await (await request.get('/exportar/dump.json')).json() as {
    rows: { errors: { id: number; sessionId: number; correctAnswer: string; ankiNoteId: number | null }[] };
  };
  const target = dump.rows.errors.find((row) => row.correctAnswer === oldest && row.ankiNoteId !== null);
  expect(target).toBeDefined();

  const panel = await editInSession(page, target?.sessionId ?? 0, oldest);
  const rewritten = 'Regla reescrita despues de convertirla en tarjeta.';
  await panel.getByRole('textbox', { name: 'Regla', exact: true }).fill(rewritten);
  await panel.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(panel).toContainText(rewritten);

  // Vuelve al listado aunque sea antigua, y con el botón que la arregla.
  await page.goto('/anki?tab=convertidas');
  const stale = converted(page).getByRole('listitem').filter({ hasText: oldest });
  await expect(stale.getByText('Desactualizada', { exact: true })).toBeVisible();
  await stale.getByRole('button', { name: 'Actualizar en Anki' }).click();
  await expect(toast(page, 'Tarjeta actualizada en Anki.')).toBeVisible();

  await page.reload();
  await expect(converted(page).getByRole('listitem').filter({ hasText: oldest })).toHaveCount(0);
});

test('corregir la categoria de un error convertido reagrupa su fallo en el repaso', async ({ page, request }) => {
  // Actualizar reescribe campos, nunca tags. Sin resolver la categoría desde el error
  // local, el fallo seguiría contando bajo la etiqueta con la que llegó de Anki.
  await page.goto('/anki');
  await createCard(page);
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(toast(page, 'repasos nuevos')).toBeVisible();

  // La nota recién creada nace sin historial: se le da un fallo en el doble.
  const first = await (await request.get('/exportar/dump.json')).json() as {
    rows: { errors: { id: number; sessionId: number; correctAnswer: string; category: string; ankiNoteId: number | null }[] };
    anki: { cards: { cardId: number; noteId: number }[] };
  };
  const linked = first.rows.errors.find((row) => row.ankiNoteId !== null);
  expect(linked).toBeDefined();
  const card = first.anki.cards.find((row) => row.noteId === linked?.ankiNoteId);
  expect(card).toBeDefined();

  await control(request, { reviewsFor: { cardId: card?.cardId ?? 0, ease: 1, type: 1 } });
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  // El aviso de la primera sincronización puede seguir a la vista: se espera el de esta.
  await expect(toast(page, 'Sincronizado: 1 repasos nuevos')).toBeVisible();

  const heading = (name: string) => page.getByRole('heading', { level: 3 }).filter({ hasText: name });
  await page.goto('/anki?tab=repasos');
  await expect(heading(categoryLabel(linked?.category ?? ''))).toBeVisible();

  // Se corrige la categoría del error vinculado, desde su sesión.
  const panel = await editInSession(page, linked?.sessionId ?? 0, linked?.correctAnswer ?? '');
  await panel.getByLabel('Categoría', { exact: true }).selectOption('REGISTRO');
  await panel.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(panel).toContainText('Registro');

  // El fallo pasa a contarse bajo la categoría corregida, sin tocar los tags de Anki.
  await page.goto('/anki?tab=repasos');
  await expect(heading('Registro')).toBeVisible();
  await expect(heading(categoryLabel(linked?.category ?? ''))).toHaveCount(0);
});
