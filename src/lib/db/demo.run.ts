import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDemo } from './demo';

try {
  const file = prepareDemo(resolve('data', 'demo'), new Date());
  console.log(`Demo con ejemplos: http://127.0.0.1:3001`);
  console.log(`Base independiente: ${file}`);
  console.log('Cada arranque crea una demo nueva. Ctrl+C para salir.');
  const child = spawn(process.execPath, [
    fileURLToPath(import.meta.resolve('next/dist/bin/next')),
    'dev', '--hostname', '127.0.0.1', '--port', '3001',
  ], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, DB_FILE_OVERRIDE: file, ERRORLOG_DEMO: '1' },
  });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    process.exitCode = signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : (code ?? 1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo arrancar la demo.');
  process.exitCode = 1;
}
