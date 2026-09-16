import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [
  fileURLToPath(import.meta.resolve('@playwright/test/cli')),
  'test', 'e2e/screenshots.spec.ts', 'e2e/demo.spec.ts',
], { stdio: 'inherit', windowsHide: true, env: { ...process.env, SHOOT: '1' } });
process.exitCode = result.status ?? 1;
