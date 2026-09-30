import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backupDatabase } from './backup';
import { createDb, type Db } from './client';
import { DB_FILE } from './paths';

/**
 * Copia temporal para exportar. Una descarga larga leería la base mientras se sigue
 * escribiendo en ella; leyendo de una copia, el cuaderno sale entero de un mismo instante.
 *
 * `close()` es idempotente porque hay tres formas de acabar: el final del stream, un error
 * a mitad y que el navegador cancele la descarga.
 */

export interface NotebookSnapshot {
  readonly db: Db;
  readonly close: () => void;
}

export async function openNotebookSnapshot(source: string = DB_FILE): Promise<NotebookSnapshot> {
  const directory = mkdtempSync(join(tmpdir(), 'errorlog-export-'));
  let db: Db | undefined;
  try {
    // La copia ya viene comprobada: integridad, claves y el esquema de esta versión.
    await backupDatabase(source, join(directory, 'snapshot.db'));
    db = createDb(join(directory, 'snapshot.db'));
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  const snapshot = db;
  let closed = false;
  return {
    db: snapshot,
    close: () => {
      if (closed) return;
      closed = true;
      try { snapshot.$client.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
    },
  };
}
