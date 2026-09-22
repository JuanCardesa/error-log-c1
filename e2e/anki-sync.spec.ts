import { expect, test, type APIRequestContext } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { FAKE_ANKI_PROFILE, FAKE_ANKI_URL } from './fakeAnki';
import { E2E_DB } from './globalSetup';

/**
 * Los flujos que solo se ven con Anki respondiendo: sincronizar, reintentar tras un
 * fallo y exportar lo sincronizado. Hablan con el doble que arranca Playwright.
 */

async function control(request: APIRequestContext, body: { failAction?: string | null; disconnected?: boolean }) {
  expect((await request.post(`${FAKE_ANKI_URL}/__control`, { data: body })).ok()).toBe(true);
}

/** El espejo es estado compartido entre specs: cada test parte y deja la base sin él. */
function clearMirror(): void {
  const db = createDb(E2E_DB);
  try {
    // Solo las conversiones verificadas salen de estos tests. Las marcas a mano de otros
    // specs no llevan nota vinculada y se quedan como estaban.
    db.$client.exec(`
      UPDATE error_row SET anki_added = 0, anki_added_at = NULL WHERE anki_note_id IS NOT NULL;
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
  await expect(panel.getByRole('status')).toContainText('Sincronizado: 4 repasos nuevos; 4 en el historial.');

  // Cuatro repasos: un lapso, un «Again» aprendiendo, dos aciertos, tres cartas distintas.
  const reviews = page.getByRole('region', { name: 'Repaso en Anki' });
  const stat = (name: string) => reviews.getByRole('term').filter({ hasText: new RegExp(`^${name}$`) }).locator('+ dd');
  await expect(stat('Repasos')).toHaveText('4');
  await expect(stat('Lapsos')).toHaveText('1');
  await expect(stat('Fallos aprendiendo')).toHaveText('1');
  await expect(stat('Cartas distintas')).toHaveText('3');
  await expect(reviews.getByText('deal with')).toBeVisible();
  // El corte de día sale de la colección, y se dice cuál se ha usado.
  await expect(panel.getByText('Día de Anki: empieza a las 4:00', { exact: false })).toBeVisible();

  // Repetir sin estudiar no inventa repasos nuevos ni duplica el historial.
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Sincronizado: 0 repasos nuevos; 4 en el historial.');
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
    queries: { q7: { reviews: number; failures: number; lapses: number; learningFailures: number; accuracy: number | null } };
  };
  expect(dump.anki.reviews).toHaveLength(4);
  expect(dump.anki.notes).toHaveLength(3);
  expect(dump.queries.q7).toMatchObject({ reviews: 4, failures: 2, lapses: 1, learningFailures: 1, accuracy: 50 });
});

test('el informe cruza los fallos de Anki con los errores de práctica', async ({ page }) => {
  await page.goto('/anki');
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conexión con Anki' }).getByRole('status')).toContainText('4 repasos nuevos');

  await page.goto('/informe');
  await expect(page.getByText('Todavía no has sincronizado Anki.', { exact: false })).toBeHidden();
  const table = page.getByRole('table', { name: /Errores de práctica y fallos en Anki/ });
  await expect(table.getByRole('columnheader', { name: 'Lapsos en Anki' })).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: 'PHRASAL_VERB' })).toBeVisible();
});

test('crear en Anki verifica la tarjeta y repetirlo no crea una segunda nota', async ({ page, request }) => {
  await page.goto('/anki');
  const pending = page.getByRole('definition').nth(1);
  const before = Number(await pending.innerText());

  // Se comprueba el resultado, no el aviso: al salir el error de la cola, la
  // revalidacion desmonta el `QueueItem` y con el su mensaje de exito.
  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  const done = page.getByRole('region', { name: 'Convertidas recientemente' });
  await expect(done.getByText('Verificada en Anki').first()).toBeVisible();
  await expect(pending).toHaveText(String(before - 1));

  // Deshacer devuelve el error a la cola y conserva la nota en Anki; volver a crearla
  // debe reencontrarla por su identidad en vez de anadir otra.
  await done.getByRole('button', { name: 'Deshacer' }).first().click();
  await expect(pending).toHaveText(String(before));
  await page.getByRole('button', { name: 'Crear en Anki' }).first().click();
  await expect(pending).toHaveText(String(before - 1));

  const dump = await (await request.get('/exportar/dump.json')).json() as { anki: { notes: { model: string }[] } };
  expect(dump.anki.notes.filter((row) => row.model === 'Error Log C1')).toHaveLength(1);
});
