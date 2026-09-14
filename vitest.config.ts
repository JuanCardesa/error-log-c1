import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // DoD §8: >90% en la logica pura. La UI se cubre con Playwright, no aqui.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/**/*.run.ts',
        'src/lib/**/fixtures/**',
        // Declaracion de tablas, sin ramas propias: lo que hay que verificar de aqui son
        // los CHECK y las claves ajenas, y eso lo hace db.test.ts contra SQLite de verdad.
        'src/lib/db/schema.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
