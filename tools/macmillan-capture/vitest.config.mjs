import { defineConfig } from 'vitest/config';

/**
 * Suite propia de la herramienta. No toca la del error-log: ni su `include` ni sus
 * umbrales de cobertura, que miden la logica de la aplicacion y no esta.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
