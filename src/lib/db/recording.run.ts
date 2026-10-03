import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRecording } from './recording';

const next = fileURLToPath(import.meta.resolve('next/dist/bin/next'));
const building = process.argv.includes('--build');
try {
  if (!building && !existsSync(resolve('.next-recording', 'BUILD_ID'))) {
    throw new Error('Primero ejecuta pnpm demo:record:build. Después, pnpm demo:record.');
  }
  // Even the build gets a disposable DB, never an inherited DB_FILE_OVERRIDE.
  const state = prepareRecording(resolve('data', 'recording'), new Date());
  const child = spawn(process.execPath, [next, ...(building ? ['build'] : ['start', '--hostname', '127.0.0.1', '--port', '3002'])], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, DB_FILE_OVERRIDE: state.file, ERRORLOG_DEMO: '1', ERRORLOG_RECORDING: '1' },
  });
  if (!building) {
    console.log('Demo para Recordly: http://127.0.0.1:3002/registrar');
    console.log(`Inicio del guion: http://127.0.0.1:3002/errores?error=${state.historicalErrorId}`);
    console.log(`Base independiente: ${state.file}`);
    console.log('Copia la tanda: Get-Content -Raw -Encoding utf8 data/recording/import.json | Set-Clipboard');
    console.log('Reset: Ctrl+C, cerrar todas las ventanas privadas, pnpm demo:record y abrir una ventana privada nueva.');
  }
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
  child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', (code, signal) => {
    process.exitCode = signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : (code ?? 1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo preparar la grabación.');
  process.exitCode = 1;
}
