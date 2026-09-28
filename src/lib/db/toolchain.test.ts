import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const drizzleRequire = createRequire(require.resolve('drizzle-kit/api'));
const loaderRequire = createRequire(drizzleRequire.resolve('@esbuild-kit/esm-loader'));
const coreRequire = createRequire(loaderRequire.resolve('@esbuild-kit/core-utils'));

it('el esbuild del cargador de Drizzle no permite leer código desde cualquier origen', async () => {
  const esbuild = coreRequire('esbuild') as {
    context(options: { stdin: { contents: string }; outfile: string; write: boolean }): Promise<{
      serve(options: { host: string }): Promise<{ port: number }>;
      dispose(): Promise<void>;
    }>;
  };
  const context = await esbuild.context({ stdin: { contents: 'console.log("private source")' }, outfile: 'app.js', write: false });
  try {
    const server = await context.serve({ host: '127.0.0.1' });
    const url = `http://127.0.0.1:${String(server.port)}/app.js`;
    const response = await fetch(url, { headers: { Origin: 'https://untrusted.example' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(url)).status).toBe(200);
  } finally { await context.dispose(); }
});

it('Drizzle carga su configuración TypeScript y genera una migración en un directorio temporal', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-toolchain-'));
  try {
    const config = join(scratch, 'drizzle.config.ts');
    const out = join(scratch, 'migrations');
    writeFileSync(config, `export default ${JSON.stringify({ schema: './src/lib/db/schema.ts', out, dialect: 'sqlite' })};`);
    const result = spawnSync(process.execPath, [drizzleRequire.resolve('./bin.cjs'), 'generate', `--config=${config}`], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const journal = JSON.parse(readFileSync(join(out, 'meta/_journal.json'), 'utf8')) as { entries: unknown[] };
    expect(journal.entries).toHaveLength(1);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
