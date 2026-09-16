import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { backupDatabase } from './backup';
import { DB_FILE } from './paths';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0]?.startsWith('--')) {
    throw new Error('Uso: pnpm db:backup [ruta-de-la-copia.db]');
  }
  if (!existsSync(DB_FILE)) {
    throw new Error(
      `Todavia no hay base de datos en ${DB_FILE}. Ejecuta pnpm db:migrate y registra algo antes de copiar.`,
    );
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = args[0] ?? resolve('data', 'backups', `errorlog-${stamp}.db`);
  const file = await backupDatabase(DB_FILE, target);
  console.log(`Copia verificada: ${file}`);
  console.log('Guarda tambien una copia fuera de este equipo.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo crear la copia.');
  process.exitCode = 1;
}
