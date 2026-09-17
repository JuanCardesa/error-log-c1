import { defineConfig, devices } from '@playwright/test';

/**
 * Suite propia de la herramienta. No levanta la app ni toca la base de datos: carga
 * ejercicios de prueba servidos por el propio test y corre el userscript ya construido.
 * Las peticiones a Macmillan se interceptan, asi que no sale nada de este equipo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
