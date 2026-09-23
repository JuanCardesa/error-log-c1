import { expect, test, type APIRequestContext } from '@playwright/test';

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

test('sincroniza, refleja los repasos y no los duplica al repetir', async ({ page }) => {
  await page.goto('/anki');
  await expect(page.getByText(`Anki conectado · perfil ${FAKE_ANKI_PROFILE}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear en Anki' }).first()).toBeEnabled();

  const panel = page.getByRole('region', { name: 'Conexión con Anki' });
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Sincronizado: 4 repasos nuevos; 4 en el historial,');
  // El aviso dice de cuanto se ha leido, para que el resultado sea proporcional.
  await expect(panel.getByRole('status')).toContainText('de 3 cartas y 3 notas leídas');

  // Cuatro repasos: un lapso, un «Again» aprendiendo, dos aciertos, tres cartas distintas.
  const reviews = page.getByRole('region', { name: 'Repaso en Anki' });
  const stat = (name: string) => reviews.getByRole('term').filter({ hasText: new RegExp(`^${name}$`) }).locator('+ dd');
  await expect(stat('Repasos')).toHaveText('4');
  await expect(stat('Lapsos')).toHaveText('1');
  await expect(stat('Fallos aprendiendo')).toHaveText('1');
  await expect(stat('Cartas distintas')).toHaveText('3');
  await expect(reviews.getByText('deal with')).toBeVisible();
  // Anki no expone su corte, asi que se supone 4:00 y se dice que es una suposicion:
  // nunca se ensena una cifra con aire de leida de la coleccion.
  await expect(panel.getByText('se supone que empieza a las 4:00', { exact: false })).toBeVisible();
  await expect(panel.getByText('ponla en ANKI_ROLLOVER_HOUR', { exact: false })).toBeVisible();

  // Repetir sin estudiar no inventa repasos nuevos ni duplica el historial.
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Sincronizado: 0 repasos nuevos; 4 en el historial,');
});

test('un fallo de Anki se explica y el reintento posterior funciona', async ({ page, request }) => {
  await control(request, { failAction: 'findCards' });
  await page.goto('/anki');
  const panel = page.getByRole('region', { name: 'Conexión con Anki' });
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Fallo simulado');
  // Un intento fallido no deja el espejo a medias.
  await expect(page.getByText('Sincroniza Anki para consultar tus repasos.', { exact: false })).toBeVisible();

  await control(request, { failAction: null });
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('4 repasos nuevos');
});

test('Anki cerrado se explica sin fingir que no hay fallos', async ({ page, request }) => {
  await control(request, { disconnected: true });
  await page.goto('/anki');
  await expect(page.getByText('No se puede conectar', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear en Anki' }).first()).toBeDisabled();
  await expect(page.getByText('Todavía no hay datos importados.', { exact: false })).toBeVisible();
});

test('lo sincronizado sale en el CSV de Q7 y en el volcado JSON', async ({ page, request }) => {
  await page.goto('/anki');
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conexión con Anki' }).getByRole('status')).toContainText('4 repasos nuevos');

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
  const pending = page.getByRole('definition').nth(1);
  const before = Number(await pending.innerText());

  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  // El aviso vive por encima de la cola: sobrevive a que el error salga de ella.
  await expect(page.getByText('Tarjeta verificada en Anki.')).toBeVisible();
  const done = page.getByRole('region', { name: 'Convertidas', exact: true });
  await expect(done.getByText('Verificada en Anki').first()).toBeVisible();
  await expect(pending).toHaveText(String(before - 1));

  // Deshacer devuelve el error a la cola y conserva la nota en Anki; volver a crearla
  // debe reencontrarla por su identidad en vez de anadir otra.
  await done.getByRole('button', { name: 'Deshacer' }).first().click();
  await expect(page.getByText('Devuelto a la cola. La nota sigue en Anki.')).toBeVisible();
  await expect(pending).toHaveText(String(before));
  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  await expect(pending).toHaveText(String(before - 1));

  const dump = await (await request.get('/exportar/dump.json')).json() as { anki: { notes: { model: string }[] } };
  expect(dump.anki.notes.filter((row) => row.model === 'Error Log C1')).toHaveLength(1);
});

test('corregir un error convertido avisa de que la tarjeta quedó vieja y deja arreglarla', async ({ page }) => {
  await page.goto('/anki');
  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  const done = page.getByRole('region', { name: 'Convertidas', exact: true });
  await expect(done.getByText('Verificada en Anki').first()).toBeVisible();

  // Se corrige el texto del error ya convertido, desde donde se corrige de verdad.
  const converted = createDb(E2E_DB);
  try {
    converted.$client.exec(`UPDATE error_row SET correct_answer = 'texto corregido'
      WHERE anki_note_id IS NOT NULL`);
  } finally { converted.$client.close(); }

  await page.reload();
  await expect(done.getByText('el texto ha cambiado desde entonces').first()).toBeVisible();

  await done.getByRole('button', { name: 'Actualizar en Anki' }).first().click();
  await expect(page.getByText('Tarjeta actualizada en Anki.')).toBeVisible();
  await page.reload();
  await expect(done.getByText('el texto ha cambiado desde entonces')).toHaveCount(0);
  await expect(done.getByText('Verificada en Anki').first()).toBeVisible();
});

test('una conversion antigua que se corrige sigue teniendo boton para actualizarla', async ({ page, request }) => {
  // Solo se enseñaban las ocho ultimas conversiones: corregir una anterior la dejaba
  // desactualizada y sin ningun sitio desde el que arreglarla.
  await page.goto('/anki');
  const queue = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Crear en Anki' }) });
  const oldest = (await queue.first().locator('strong').first().innerText()).trim();

  for (let i = 0; i < 9; i += 1) {
    await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
    await expect(page.getByText('Tarjeta verificada en Anki.')).toBeVisible();
    await page.reload();
  }

  const done = page.getByRole('region', { name: 'Convertidas', exact: true });
  // La novena por antigüedad queda fuera del listado mientras no pida nada.
  await expect(done.getByText(oldest, { exact: true })).toHaveCount(0);

  // Se corrige desde donde se corrige de verdad: la sesion en Registrar.
  const dump = await (await request.get('/exportar/dump.json')).json() as {
    rows: { errors: { id: number; sessionId: number; correctAnswer: string; ankiNoteId: number | null }[] };
  };
  const target = dump.rows.errors.find((row) => row.correctAnswer === oldest && row.ankiNoteId !== null);
  expect(target).toBeDefined();

  await page.goto(`/registrar?s=${String(target?.sessionId ?? 0)}`);
  const row = page.getByRole('row').filter({ hasText: oldest }).first();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });
  const rewritten = 'Regla reescrita despues de convertirla en tarjeta.';
  await editForm.getByLabel('Regla, con tus palabras *').fill(rewritten);
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('cell', { name: rewritten, exact: true })).toBeVisible();

  // Vuelve al listado aunque sea antigua, y con el boton que la arregla.
  await page.goto('/anki');
  const stale = done.getByRole('listitem').filter({ hasText: oldest });
  await expect(stale.getByText('el texto ha cambiado desde entonces')).toBeVisible();
  await stale.getByRole('button', { name: 'Actualizar en Anki' }).click();
  await expect(page.getByText('Tarjeta actualizada en Anki.')).toBeVisible();

  await page.reload();
  await expect(done.getByRole('listitem').filter({ hasText: oldest })).toHaveCount(0);
});

test('corregir la categoria de un error convertido reagrupa su fallo en el repaso', async ({ page, request }) => {
  // Actualizar reescribe campos, nunca tags. Sin resolver la categoria desde el error
  // local, el fallo seguiria contando bajo la etiqueta con la que llego de Anki.
  await page.goto('/anki');
  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  await expect(page.getByText('Tarjeta verificada en Anki.')).toBeVisible();
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conexión con Anki' }).getByRole('status'))
    .toContainText('repasos nuevos');

  // La nota recien creada nace sin historial: se le da un fallo en el doble.
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
  await expect(page.getByRole('region', { name: 'Conexión con Anki' }).getByRole('status'))
    .toContainText('repasos nuevos');

  const reviews = page.getByRole('region', { name: 'Repaso en Anki' });
  const heading = (name: string) => reviews.getByRole('heading', { level: 3 }).filter({ hasText: name });
  await expect(heading(categoryLabel(linked?.category ?? ''))).toBeVisible();

  // Se corrige la categoria del error vinculado, desde Registrar.
  await page.goto(`/registrar?s=${String(linked?.sessionId ?? 0)}`);
  const row = page.getByRole('row').filter({ hasText: linked?.correctAnswer ?? '' }).first();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  const editForm = page.locator('form').filter({ hasText: 'Guardar cambios' });
  await editForm.getByLabel('Categoría *').selectOption('REGISTRO');
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('cell', { name: 'Registro', exact: true })).toBeVisible();

  // El fallo pasa a contarse bajo la categoria corregida, sin tocar los tags de Anki.
  await page.goto('/anki');
  await expect(heading('Registro')).toBeVisible();
  await expect(heading(categoryLabel(linked?.category ?? ''))).toHaveCount(0);
});
