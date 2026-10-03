import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { prepareRecording } from '../src/lib/db/recording';

async function frame(page: Page, info: TestInfo, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

for (const take of [1, 2]) test(`Recordly story, fresh take ${take}`, async ({ page }, info) => {
  expect(existsSync('.next-recording/BUILD_ID'), 'Run pnpm demo:record:build first').toBe(true);
  const state = prepareRecording(resolve('data', 'recording-verification'), new Date());
  const base = 'http://127.0.0.1:3212';
  let serverLog = '';
  const child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('next/dist/bin/next')),
    'start', '--hostname', '127.0.0.1', '--port', '3212'], {
    windowsHide: true, stdio: 'pipe',
    env: { ...process.env, DB_FILE_OVERRIDE: state.file, ERRORLOG_RECORDING: '1', ERRORLOG_DEMO: '1' },
  });
  child.stdout.on('data', (data: Buffer) => { serverLog += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { serverLog += data.toString(); });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  try {
    await expect.poll(async () => {
      if (child.exitCode !== null) throw new Error(serverLog);
      try { return (await fetch(`${base}/registrar`)).status; } catch { return 0; }
    }, { timeout: 60_000 }).toBe(200);
    // Scene 1: the history already contains the earlier research mistake.
    await page.goto(`${base}/errores?error=${state.historicalErrorId}`);
    await expect(page.getByRole('complementary', { name: 'Detalle del error' }).getByText('carried out', { exact: true })).toBeVisible();
    await frame(page, info, '01-hook');
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Sesiones', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sesiones', exact: true })).toBeVisible();
    // Scene 2: import the file generated for this take, through the real review UI.
    await page.getByLabel('Pegar correcciones', { exact: true }).fill(readFileSync(state.importFile, 'utf8'));
    await page.getByRole('button', { name: 'Revisar importación', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisar importación', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Confianza', exact: true }).selectOption('SEGURO');
    await expect(page.getByRole('button', { name: /^Crear sesión y guardar 3 errores/ })).toBeInViewport();
    await frame(page, info, '02-review');
    await page.getByRole('button', { name: /^Crear sesión y guardar 3 errores/ }).click();
    await expect(page.getByRole('heading', { name: 'Urban gardens · collocations', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ver error 1: carried out', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    await expect(panel.getByText('Seguro', { exact: true })).toBeVisible();
    await frame(page, info, '03-saved');
    // Scene 3: explicitly connect the imported mistake with the prepared study note.
    const links = page.getByRole('region', { name: 'Apuntes vinculados' });
    await links.getByRole('button', { name: 'Vincular apunte' }).click();
    await links.getByRole('searchbox', { name: 'Buscar apuntes' }).fill('research');
    await expect(links.getByRole('list', { name: 'Apuntes encontrados' }).getByRole('button')).toHaveCount(1);
    await expect(links.getByRole('button', { name: 'Collocations · research, conclusions, awareness', exact: true })).toBeVisible();
    await links.getByRole('button', { name: 'Collocations · research, conclusions, awareness', exact: true }).scrollIntoViewIfNeeded();
    await frame(page, info, '03b-link-picker');
    await links.getByRole('button', { name: 'Collocations · research, conclusions, awareness', exact: true }).click();
    await links.getByRole('combobox', { name: 'Apartado' }).selectOption({ label: 'Research' });
    await links.getByRole('button', { name: 'Guardar vínculo' }).scrollIntoViewIfNeeded();
    await expect(links.getByRole('button', { name: 'Guardar vínculo' })).toBeInViewport({ ratio: 1 });
    await frame(page, info, '03c-link-section');
    await links.getByRole('button', { name: 'Guardar vínculo' }).click();
    await links.getByRole('link', { name: 'Collocations · research, conclusions, awareness' }).click();
    await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeInViewport();
    const related = page.getByRole('region', { name: 'Errores relacionados' }).getByRole('link').filter({ hasText: 'carried out' });
    await expect(related).toHaveCount(2);
    await expect(related.nth(0)).toBeInViewport({ ratio: 1 });
    await expect(related.nth(1)).toBeInViewport({ ratio: 1 });
    // A human spends >5 seconds linking; wait for the real toast expiry in this fast rehearsal.
    await expect(page.getByRole('button', { name: 'Cerrar aviso' })).toHaveCount(0);
    await frame(page, info, '04-notebook');
    // Scene 4: the recommendation and its evidence come from the real rules engine.
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso', exact: true }).click();
    const recommendation = page.getByRole('heading', { name: 'Dedica una sesión a tus tarjetas pendientes de Anki' });
    await expect(recommendation).toBeInViewport();
    await expect(page.getByText('14 sesiones', { exact: true })).toBeVisible();
    await expect(page.getByText('90 ítems contabilizados (excluye Writing)', { exact: true })).toBeVisible();
    await expect(page.getByText('26 errores, 4 de ellos en Writing', { exact: true })).toBeVisible();
    await expect(page.getByText('0 de 25 errores elegibles', { exact: false })).toBeVisible();
    await frame(page, info, '05-progress');
    // Scene 5: inspect a denominator, rather than imply an official exam score.
    await page.getByRole('link', { name: 'Reading & Use of English', exact: true }).click();
    await page.getByRole('button', { name: /Part 3,.*100.*8 de 8/ }).click();
    await expect(page.getByRole('heading', { name: 'Part 3 · 100 %', exact: true })).toBeInViewport();
    await frame(page, info, '06-evolution');
    // Scene 6: close on one concrete next step, without pretending to create a card.
    await page.getByRole('link', { name: 'Resumen', exact: true }).click();
    await expect(recommendation).toBeInViewport();
    await frame(page, info, '07-action');
    expect(errors).toEqual([]);
  } finally {
    await info.attach('server-log', { body: serverLog, contentType: 'text/plain' });
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }
});
