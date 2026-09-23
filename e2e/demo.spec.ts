import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

/** Recorrido real sobre la base desechable de Playwright; solo genera medios con SHOOT=1. */
async function frame(page: Page, step: number, title: string, subtitle: string) {
  await page.evaluate(({ step, title, subtitle }) => {
    let banner = document.getElementById('demo-caption');
    if (banner === null) {
      banner = document.createElement('aside');
      banner.id = 'demo-caption';
      document.body.prepend(banner);
      banner.style.cssText = 'position:fixed;inset:0 0 auto;z-index:9999;height:90px;padding:16px 32px;background:#1c1b17;color:#faf8f1;box-sizing:border-box;display:flex;align-items:center;gap:22px;font-family:system-ui,sans-serif';
      document.body.style.paddingTop = '90px';
    }
    banner.replaceChildren();
    const counter = document.createElement('span');
    counter.textContent = `0${String(step)} / 05`;
    counter.style.cssText = 'font:600 17px monospace;color:#e8bc75;white-space:nowrap';
    const text = document.createElement('div');
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-size:23px;font-weight:650;line-height:1.3';
    const detail = document.createElement('div');
    detail.textContent = subtitle;
    detail.style.cssText = 'font-size:14px;color:#c9c5b9;margin-top:3px';
    text.append(heading, detail);
    const label = document.createElement('span');
    label.textContent = 'ERROR LOG C1 · DEMO';
    label.style.cssText = 'margin-left:auto;font:12px monospace;letter-spacing:1px;white-space:nowrap;color:#c9c5b9';
    banner.append(counter, text, label);
  }, { step, title, subtitle });
  await page.screenshot({ path: `docs/media/step-${String(step)}.png`, animations: 'disabled' });
}

test('recorrido de registro e informe para el README', async ({ page }) => {
  test.skip(process.env['SHOOT'] === undefined, 'solo al generar la demo');
  mkdirSync('docs/media', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'Nueva sesión a mano' }).click();
  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('6');
  await page.getByLabel('Referencia').fill('Práctica semanal · datos de ejemplo');
  await frame(page, 1, 'Empieza por tu sesión', 'Los intentos también cuentan: 2 errores sobre 8 ejercicios.');

  await page.getByRole('button', { name: 'Abrir sesion', exact: true }).click();
  await page.getByRole('button', { name: 'Pegar varios errores', exact: true }).click();
  await page.getByLabel('Errores para importar').fill(
    'Item\tEnunciado\tMi respuesta\tCorrecta\tCategoria\tRegla\n'
    + '4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar una actividad.\n'
    + '5\tShe is interested ___ music.\ton\tin\tPREPOSICION_DEPENDIENTE\tInterested se construye con in.',
  );
  await page.getByLabel('Errores para importar').scrollIntoViewIfNeeded();
  await frame(page, 2, 'Pega tus correcciones', 'Desde una tabla o una respuesta de IA, sin transcribir cada campo.');

  await page.getByRole('button', { name: 'Preparar vista previa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisar 2 errores' })).toBeVisible();
  const first = page.getByRole('group', { name: 'Error 1', exact: true });
  await first.getByRole('combobox', { name: /^Causa/ }).selectOption('CONFUSION');
  await first.getByRole('combobox', { name: 'Confianza', exact: true }).selectOption('SEGURO');
  await first.scrollIntoViewIfNeeded();
  await frame(page, 3, 'Revisa qué falló y por qué', 'Ajusta causa, confianza y regla antes de guardar la tanda.');

  await page.getByRole('button', { name: 'Guardar 2 errores', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 errores guardados.' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Errores registrados en esta sesion' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.scrollIntoViewIfNeeded();
  await frame(page, 4, 'Tus errores, guardados', 'La tanda se guarda completa; los duplicados de la misma sesión se omiten.');

  await page.goto('/informe');
  // La captura muestra lo que se ve al abrir: la accion destacada y sus cifras. La tabla
  // de las siete reglas queda plegada, que es su estado real por defecto.
  await expect(page.getByText('DO NOW').first()).toBeVisible();
  await frame(page, 5, 'Elige una acción para esta semana', 'El informe prioriza el siguiente paso y muestra la cifra que lo justifica.');
});
