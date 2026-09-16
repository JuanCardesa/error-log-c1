import { existsSync } from 'node:fs';

import { restoreDatabase } from './backup';
import { DB_FILE } from './paths';

try {
  const args = process.argv.slice(2);
  const source = args[0];
  if (source === undefined || args.length > 2 || source.startsWith('--')) {
    throw new Error('Uso: pnpm db:restore copia.db [destino-nuevo.db]');
  }
  if (!existsSync(source)) {
    throw new Error(`No se encuentra la copia: ${source}. Revisa la ruta; en data/backups/ estan las de pnpm db:backup.`);
  }
  const file = await restoreDatabase(source, args[1] ?? DB_FILE);
  console.log(`Base restaurada y verificada: ${file}`);
  console.log('Para usar una ruta alternativa, configura DB_FILE_OVERRIDE antes de migrar y arrancar.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo restaurar la copia.');
  process.exitCode = 1;
}
