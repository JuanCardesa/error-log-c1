import { expect, test } from '@playwright/test';

/**
 * La entrada de Registrar, por orden de uso: retomar una sesion abierta, pegar la tanda
 * de Macmillan y, a un clic, abrir una a mano. Lo que se comprueba es ese orden de
 * prioridades, no un diseño.
 */

const session = { date: '2026-09-15', kind: 'DRILL', paper: null, part: null, source: 'LIBRO', sourceRef: 'Entrada de Registrar', itemsTotal: 8, itemsCorrect: 6, timed: false };
const row = { prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off', category: 'PHRASAL_VERB', ruleNote: 'Call off significa cancelar una actividad.' };

test('la sesion a mano queda plegada y una abierta se retoma desde arriba', async ({ page }) => {
  await page.goto('/registrar');

  // Plegada: sus campos no estan a la vista hasta pedirla.
  const toggle = page.getByRole('button', { name: 'Nueva sesión a mano' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Items *')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.getByLabel('Items *').fill('8');
  await page.getByLabel('Aciertos *').fill('6');
  await page.getByLabel('Referencia').fill('Sesion para retomar');
  await page.getByRole('button', { name: 'Abrir sesion' }).click();
  await expect(page).toHaveURL(/s=\d+/);
  const id = new URL(page.url()).searchParams.get('s');

  // De vuelta en la entrada, la abierta encabeza la pagina y lleva a la captura.
  await page.goto('/registrar');
  const open = page.getByRole('region', { name: 'Sesiones abiertas' });
  const resume = open.locator(`a[href="/registrar?s=${String(id)}#captura"]`);
  await expect(resume).toContainText('Continuar');
  await resume.click();
  await expect(page.getByLabel('Item', { exact: true })).toBeFocused();
});

test('mientras se revisa una tanda, la entrada deja solo la revision', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByLabel('Sesión y errores para importar').fill(JSON.stringify({ session, errors: [row] }));
  await page.getByRole('button', { name: 'Revisar sesión y errores' }).click();

  await expect(page.getByRole('group', { name: 'Cabecera propuesta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva sesión a mano' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sesiones recientes' })).toBeHidden();
});
