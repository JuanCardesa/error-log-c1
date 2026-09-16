import next from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.next-demo/**',
      '.next-e2e/**',
      'node_modules/**',
      'coverage/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...next,
  ...tseslint.configs.recommended,

  {
    // eslint-plugin-react intenta detectar la version leyendo del disco con una API
    // que ESLint 10 ya no expone. Declararla evita esa ruta por completo.
    settings: { react: { version: '19.3' } },
  },

  {
    rules: {
      // DoD §8: cero `any`, cero `@ts-ignore`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description', 'ts-nocheck': true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Seed and migration runners are CLI scripts: printing is the point.
    files: ['src/lib/db/*.run.ts', 'src/lib/db/seed.ts'],
    rules: { 'no-console': 'off' },
  },
);
