import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { exercisePage, TWO_GAPS } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(here, '../dist/errorlog-macmillan.user.js'), 'utf8');

/**
 * Origen neutro a proposito: esta suite prueba el detector GENERICO, el que se usa fuera
 * del reproductor de Macmillan. Todo se sirve desde el propio test, sin salir del equipo.
 */
const PLAYER = 'https://ejercicios.example.org/unidad/3';

async function openExercise(page, html) {
  await page.route('https://ejercicios.example.org/**', (route) => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(PLAYER);
  await page.addScriptTag({ content: SCRIPT });
  await page.getByRole('button', { name: 'Errores', exact: false }).click();
}

/** Escribe como lo haria yo: pulsaciones de verdad, que es lo que el guion escucha. */
async function answer(page, index, text) {
  const input = page.locator('.gap input').nth(index);
  await input.click();
  await input.pressSequentially(text);
}

const status = (page) => page.locator('.status');
const block = (page) => page.locator('textarea[aria-label="Bloque para copiar"]');

async function copiedRows(page) {
  await page.getByRole('button', { name: 'Copiar todo' }).click();
  await expect(block(page)).not.toHaveValue('');
  return JSON.parse(await block(page).inputValue());
}

test('un ejercicio sin corregir no exporta nada', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'off');

  await expect(status(page)).toHaveText(/no esta corregido/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('un ejercicio entero correcto no genera ninguna entrada', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'off');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(status(page)).toHaveText(/todo correcto/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

test('de una mezcla de aciertos y fallos salen solo los fallos', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'out');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(status(page)).toHaveText(/2 fallos guardados/i);
  const rows = await copiedRows(page);

  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.itemRef)).toEqual(['1', '3']);
  expect(rows.map((row) => row.myAnswer)).toEqual(['of', 'out']);
  expect(rows[0].prompt).toContain('They called ___ the meeting.');
});

test('el recuento de aciertos se queda en la cabecera, no en el listado', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.locator('.counts')).toHaveText(/3 respuestas comprobadas, 2 aciertos/i);
  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  for (const row of rows) {
    expect(row).not.toHaveProperty('itemsCorrect');
    expect(JSON.stringify(row)).not.toContain('aciertos');
  }
});

test('«mostrar respuestas» no me quita mi respuesta y aporta la solucion', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(status(page)).toHaveText(/1 fallo guardado/i);

  await page.getByRole('button', { name: 'Show answers' }).click();
  await expect(page.locator('.gap input').first()).toHaveValue('off');

  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].myAnswer).toBe('of');
  expect(rows[0].correctAnswer).toBe('off');
});

test('con varios huecos identifica el fallado y conserva el contexto', async ({ page }) => {
  await openExercise(page, exercisePage({ questions: TWO_GAPS }));
  await answer(page, 0, 'got');
  await answer(page, 1, 'sat');
  await page.getByRole('button', { name: 'Check' }).click();

  const rows = await copiedRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].itemRef).toBe('7.2');
  expect(rows[0].myAnswer).toBe('sat');
  expect(rows[0].prompt).toContain('She ___(1) up early and ___(2) out.');
});

test('exportar dos veces no duplica entradas', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();

  expect(await copiedRows(page)).toHaveLength(1);

  // Copiado ya, la bandeja se vacia y el boton se apaga en vez de repetir la entrada.
  await expect(page.locator('.tray')).toHaveText(/vacia/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();

  // Olvidar lo copiado devuelve los fallos a la bandeja en el momento.
  await page.getByRole('button', { name: 'Olvidar lo exportado' }).click();
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeEnabled();
  await expect(page.locator('.tray')).toHaveText(/1 fallo guardado/i);
});

test('un intento nuevo se guarda aparte y no mezcla respuestas con el anterior', async ({ page }) => {
  await openExercise(page, exercisePage());
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(status(page)).toHaveText(/1 fallo guardado/i);

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(status(page)).toHaveText(/no esta corregido/i);

  await answer(page, 0, 'off');
  await answer(page, 1, 'after');
  await answer(page, 2, 'down');
  await page.getByRole('button', { name: 'Check' }).click();

  // Los dos fallos quedan, cada uno con SU respuesta: no se contamina uno con el otro.
  const rows = await copiedRows(page);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => [row.itemRef, row.myAnswer])).toEqual([['1', 'of'], ['3', 'down']]);
});

test('si solo hay color, dice que no lo sabe leer en vez de fingir', async ({ page }) => {
  await openExercise(page, exercisePage({ marking: 'colour' }));
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(status(page)).toHaveText(/no reconozco como marca la correccion/i);
  await expect(page.getByRole('button', { name: 'Copiar todo' })).toBeDisabled();
});

for (const marking of ['aria', 'attr']) {
  test(`lee la correccion marcada por ${marking}`, async ({ page }) => {
    // Titulo propio por formato: cada ejercicio es una actividad distinta y no comparte
    // el registro de lo ya exportado.
    await openExercise(page, exercisePage({ marking, title: `Unit 3 — marcado ${marking}` }));
    await answer(page, 0, 'of');
    await answer(page, 1, 'after');
    await answer(page, 2, 'up');
    await page.getByRole('button', { name: 'Check' }).click();

    const rows = await copiedRows(page);
    expect(rows).toHaveLength(1);
    expect(rows[0].myAnswer).toBe('of');
    expect(rows[0].itemRef).toBe('1');
  });
}

test('lo ya exportado se recuerda aunque recargue el ejercicio', async ({ page }) => {
  const html = exercisePage({ title: 'Unit 4 — memoria de exportacion' });
  await openExercise(page, html);
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();
  expect(await copiedRows(page)).toHaveLength(1);

  await page.reload();
  await page.addScriptTag({ content: SCRIPT });
  await page.getByRole('button', { name: 'Errores', exact: false }).click();
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'up');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(status(page)).toHaveText(/ya estaban guardados/i);
  await expect(page.locator('.tray')).toHaveText(/vacia/i);
});

test('la muestra tecnica no lleva cookies ni la query de la URL', async ({ page }) => {
  await openExercise(page, exercisePage());
  await page.evaluate(() => { document.cookie = 'sesion=secreto-que-no-debe-salir'; });
  await page.getByRole('button', { name: 'Copiar muestra tecnica' }).click();

  const sample = await block(page).inputValue();
  expect(sample).toContain('Muestra tecnica');
  expect(sample).not.toContain('secreto-que-no-debe-salir');
  expect(sample).toContain('ejercicios.example.org/unidad/3');
});

test('si la pagina inserta un hueco nuevo, cada respuesta sigue siendo de su pregunta', async ({ page }) => {
  await openExercise(page, exercisePage({ title: 'Unit 9 — huecos que aparecen' }));
  await answer(page, 0, 'of');
  await answer(page, 1, 'after');
  await answer(page, 2, 'out');

  // El ejercicio anade una pregunta ANTES de las demas, como hacen los que cargan por
  // partes. Si los identificadores se recalculan por orden, cada control hereda la
  // respuesta del de al lado.
  await page.evaluate(() => {
    const lista = document.querySelector('ol.exercise');
    const nueva = document.createElement('li');
    nueva.className = 'question';
    nueva.innerHTML = '<span class="num">0</span> Extra <span class="gap"><input type="text" data-solution="x"></span> question.';
    lista.insertBefore(nueva, lista.firstChild);
  });

  await page.getByRole('button', { name: 'Check' }).click();

  const rows = await copiedRows(page);
  const porItem = Object.fromEntries(rows.map((row) => [row.itemRef, row.myAnswer]));
  expect(porItem['1']).toBe('of');
  expect(porItem['3']).toBe('out');
});
