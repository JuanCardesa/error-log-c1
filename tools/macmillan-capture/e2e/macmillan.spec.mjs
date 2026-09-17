import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { rcfActivityPage } from './rcf-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(here, '../dist/errorlog-macmillan.user.js'), 'utf8');

/** El reproductor real vive aqui. Interceptado: no sale ni una peticion del equipo. */
const PLAYER = 'https://mee.macmillaneducation.com/rcf-player.html';

let serial = 0;

async function openActivity(page, options = {}) {
  serial += 1;
  const activityId = options.activityId ?? `act${String(serial).padStart(29, '0')}`;
  const html = rcfActivityPage({ ...options, activityId });
  await page.route('https://mee.macmillaneducation.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(PLAYER);
  await page.addScriptTag({ content: SCRIPT });
  await page.getByRole('button', { name: 'Errores', exact: false }).click();
  return activityId;
}

const status = (page) => page.locator('.status');
const block = (page) => page.locator('textarea[aria-label="Bloque para copiar"]');

async function copiedRows(page) {
  await page.getByRole('button', { name: 'Copiar todo' }).click();
  await expect(block(page)).not.toHaveValue('');
  return JSON.parse(await block(page).inputValue());
}

test('de una actividad corregida salen solo los fallos, con su numero de item', async ({ page }) => {
  await openActivity(page, { score: 'Scored 2 out of 3' });

  await expect(status(page)).toHaveText(/1 fallo guardado/i);
  const rows = await copiedRows(page);

  expect(rows).toHaveLength(1);
  expect(rows[0].itemRef).toBe('3');
  expect(rows[0].myAnswer).toBe('visit');
  expect(rows[0].prompt).toContain('pay a / return a / ___');
});

test('sin la marca de correccion no exporta nada', async ({ page }) => {
  await openActivity(page, { marked: false });

  await expect(status(page)).toHaveText(/no esta corregido/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('una actividad entera correcta no genera entradas', async ({ page }) => {
  await openActivity(page, {
    items: [
      { ref: '1', lines: ['hold a'], id: 'CAPE_ID_3', answer: 'party', verdict: 'correct' },
      { ref: '2', lines: ['make a'], id: 'CAPE_ID_6', answer: 'decision', verdict: 'correct' },
    ],
  });

  await expect(status(page)).toHaveText(/todo correcto/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('si aria y la clase se contradicen, no se elige ganador', async ({ page }) => {
  await openActivity(page, { conflict: true });

  await expect(status(page)).toHaveText(/se contradicen/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('el recuento va a la cabecera de la sesion, no al listado', async ({ page }) => {
  await openActivity(page);

  await expect(page.locator('.counts')).toHaveText(/3 respuestas comprobadas, 2 aciertos/i);
  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain('aciertos');
});

test('ni la marca ni el texto de accesibilidad se cuelan en el enunciado', async ({ page }) => {
  await openActivity(page);
  const rows = await copiedRows(page);

  expect(rows[0].myAnswer).toBe('visit');
  expect(rows[0].prompt).not.toMatch(/incorrect/i);
  expect(rows[0].prompt).not.toMatch(/ruido de accesibilidad/i);
  expect(rows[0].prompt).not.toMatch(/Press the Down Arrow/i);
});

test('el enunciado lleva instrucciones, texto de referencia y opciones', async ({ page }) => {
  await openActivity(page);
  const rows = await copiedRows(page);

  expect(rows[0].prompt).toContain('Complete each pair of verbs');
  expect(rows[0].prompt).toContain('held a big party');
  expect(rows[0].prompt).toContain('Opciones: party, decision, visit, compliment');
});

test('no se inventan solucion, categoria ni regla', async ({ page }) => {
  await openActivity(page);
  const rows = await copiedRows(page);

  expect(rows[0].correctAnswer).toBe('');
  expect(rows[0].category).toBe('');
  expect(rows[0].ruleNote).toBe('');
  expect(rows[0]).not.toHaveProperty('cause');
  expect(rows[0]).not.toHaveProperty('confidence');
});

test('al reintentar vuelve a «sin corregir» pero el fallo ya cometido no se pierde', async ({ page }) => {
  await openActivity(page);
  await expect(status(page)).toHaveText(/1 fallo guardado/i);

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toHaveText(/no esta corregido/i);

  // Fallarlo y luego acertarlo no borra que lo fallaste: eso es el registro de errores.
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeEnabled();
});

test('un tipo de interaccion sin comprobar se avisa, no se da por bueno en silencio', async ({ page }) => {
  await openActivity(page, { interactions: 'rcfSomethingElse' });

  await expect(status(page)).toHaveText(/1 fallo guardado/i);
  await expect(page.locator('.detail')).toHaveText(/no lo he comprobado contra Macmillan/i);
});

test('acumula los fallos de varias actividades y los entrega en un solo bloque', async ({ page }) => {
  await openActivity(page, { activityId: 'act0000000000000000000000000aaa' });
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado de 1 actividad/i);

  // Segunda actividad de la misma sesion de estudio, con otro fallo distinto.
  await openActivity(page, {
    activityId: 'act0000000000000000000000000bbb',
    items: [
      { ref: '1', lines: ['draw a'], id: 'CAPE_ID_3', answer: 'conclusion', verdict: 'correct' },
      { ref: '2', lines: ['break a'], id: 'CAPE_ID_6', answer: 'promise', verdict: 'incorrect' },
    ],
  });
  await expect(page.locator('.tray')).toHaveText(/2 fallos guardados de 2 actividades/i);

  const rows = await copiedRows(page);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.myAnswer)).toEqual(['visit', 'promise']);

  // Entregada la bandeja, queda vacia y no se repite.
  await expect(page.locator('.tray')).toHaveText(/vacia/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('la bandeja sobrevive a recargar y sigue contando', async ({ page }) => {
  await openActivity(page, { activityId: 'act00000000000000000000000000cc' });
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);

  await page.reload();
  await page.addScriptTag({ content: SCRIPT });
  await page.getByRole('button', { name: 'Errores', exact: false }).click();

  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);
});

test('vaciar la bandeja descarta y no vuelve a recoger lo mismo', async ({ page }) => {
  await openActivity(page);
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);

  await page.getByRole('button', { name: 'Vaciar la bandeja' }).click();
  await expect(page.locator('.tray')).toHaveText(/vacia/i);

  // Aunque la pagina se vuelva a leer, lo descartado no reaparece solo.
  await page.reload();
  await page.addScriptTag({ content: SCRIPT });
  await page.getByRole('button', { name: 'Errores', exact: false }).click();
  await expect(page.locator('.tray')).toHaveText(/vacia/i);
});

/** Pone el texto de un hueco, como si arrastrase la palabra correcta. */
async function dropInto(page, rcfid, text) {
  await page.evaluate(([id, value]) => {
    document.querySelector(`[data-rcfid="${id}"] .dragTarget`).textContent = value;
  }, [rcfid, text]);
}

test('si reintento y acierto, la solucion la confirma Macmillan y entra en el fallo guardado', async ({ page }) => {
  await openActivity(page);
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);

  // Reintento y esta vez pongo la palabra buena.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toHaveText(/no esta corregido/i);
  await dropInto(page, 'CAPE_ID_9', 'compliment');
  await page.getByRole('button', { name: 'Check' }).click();

  // La actividad queda perfecta, pero el fallo anterior sigue guardado y ya con solucion.
  await expect(status(page)).toHaveText(/todo correcto/i);
  await expect(page.locator('.note')).toHaveText(/confirmado la solucion de 1 fallo/i);

  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].myAnswer).toBe('visit');
  expect(rows[0].correctAnswer).toBe('compliment');
});

test('si reintento y vuelvo a fallar, no se inventa ninguna solucion', async ({ page }) => {
  await openActivity(page);
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toHaveText(/no esta corregido/i);
  await dropInto(page, 'CAPE_ID_9', 'decision');
  await page.getByRole('button', { name: 'Check' }).click();

  const rows = await copiedRows(page);
  expect(rows.every((row) => row.correctAnswer === '')).toBe(true);
});

test('si en el reintento dejo el hueco en blanco, no se arrastra la respuesta anterior', async ({ page }) => {
  await openActivity(page);
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);

  // Segundo intento: borro el hueco y lo dejo sin contestar.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toHaveText(/no esta corregido/i);
  await dropInto(page, 'CAPE_ID_9', '');
  await page.getByRole('button', { name: 'Check' }).click();

  const rows = await copiedRows(page);
  const respuestas = rows.map((row) => row.myAnswer).sort();
  expect(respuestas).toEqual(['', 'visit']);
});

test('si la actividad sustituye mi respuesta al corregir, se conserva la mia', async ({ page }) => {
  await openActivity(page, {
    replaceOnCheck: true,
    marked: false,
    items: [
      { ref: '1', lines: ['They called'], id: 'CAPE_ID_3', answer: '', solution: 'off', verdict: 'incorrect', kind: 'input' },
    ],
  });

  // Escribo con pulsaciones reales, que es lo unico que distingue lo mio de lo suyo.
  const campo = page.locator('.gapInput').first();
  await campo.click();
  await campo.pressSequentially('of');
  await page.getByRole('button', { name: 'Check' }).click();

  // La plataforma ha puesto «off» en el campo, pero mi respuesta fue «of».
  await expect(campo).toHaveValue('off');

  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].myAnswer).toBe('of');
  expect(rows[0].correctAnswer).toBe('off');
});

test('la muestra tecnica enmascara lo que parezca una credencial de la pagina', async ({ page }) => {
  await openActivity(page);

  // La pagina puede llevar cosas asi en cualquier atributo; la muestra se comparte.
  await page.evaluate(() => {
    const gap = document.querySelector('[data-rcfid]');
    gap.setAttribute('data-session-token', 'secreto-que-no-debe-salir');
    gap.setAttribute('data-src', 'https://ejemplo.test/x?contentId=42&access_token=otro-secreto');
    document.querySelector('.activity').setAttribute('data-config', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r');
  });

  await page.getByRole('button', { name: 'Copiar muestra tecnica' }).click();
  const muestra = await block(page).inputValue();

  expect(muestra).not.toContain('secreto-que-no-debe-salir');
  expect(muestra).not.toContain('otro-secreto');
  expect(muestra).not.toContain('eyJhbGci');
  expect(muestra).toContain('[OCULTO]');

  // Y lo que si hace falta para escribir el adaptador sigue estando.
  expect(muestra).toContain('data-rcfid');
  expect(muestra).toContain('markable');
  expect(muestra).toContain('aria-invalid');
});
