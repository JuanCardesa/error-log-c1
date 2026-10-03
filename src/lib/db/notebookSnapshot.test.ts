import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { notebookZipEntries } from './notebookExport';
import { createNotebookNote, saveNotebookNote } from './notebookRepo';
import { openNotebookSnapshot } from './notebookSnapshot';

const NOW = new Date('2026-09-29T10:00:00.000Z');
let directory: string;
let file: string;
let db: Db;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'errorlog-snapshot-test-'));
  file = join(directory, 'source.db');
  db = createDb(file);
  migrate(db);
});
afterEach(() => {
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
});

/** Los temporales del exportador viven en el directorio del sistema con este prefijo. */
const exportTemporaries = () => readdirSync(tmpdir()).filter((name) => name.startsWith('errorlog-export-'));

function note(title: string, markdown: string) {
  return createNotebookNote(db, {
    uid: randomUUID(), title, folderId: null, tags: [], contentMarkdown: markdown,
  }, NOW.toISOString()).note;
}

describe('copia temporal para exportar', () => {
  it('lee el cuaderno de la copia y la borra al cerrar', async () => {
    note('Past modal verbs', '# Past modal verbs\n\ncuerpo\n');
    const before = exportTemporaries().length;

    const snapshot = await openNotebookSnapshot(file);
    expect(exportTemporaries().length).toBe(before + 1);
    const entry = notebookZipEntries(snapshot.db, NOW).find((item) => item.kind === 'note');
    expect(entry?.kind === 'note' ? entry.read() : '').toContain('cuerpo');

    snapshot.close();
    expect(exportTemporaries().length).toBe(before);
  });

  it('lo que se escriba después no cambia lo que ya se está exportando', async () => {
    const first = note('Past modal verbs', '# Past modal verbs\n\nversión uno\n');
    const snapshot = await openNotebookSnapshot(file);
    try {
      saveNotebookNote(db, {
        id: first.id, uid: first.uid, expectedRevision: first.revision,
        title: 'Otro título', folderId: null, tags: [], contentMarkdown: '# Otro\n\nversión dos\n',
      }, new Date().toISOString());

      const entries = notebookZipEntries(snapshot.db, NOW);
      const found = entries.find((entry) => entry.kind === 'note');
      const text = found?.kind === 'note' ? found.read() : '';
      // La copia conserva el título, la revisión y el cuerpo del mismo instante.
      expect(text).toContain('title: "Past modal verbs"');
      expect(text).toContain('versión uno');
      expect(text).not.toContain('versión dos');
      expect(entries[0]?.path).toBe(`Notebook/${String(first.id)}-past-modal-verbs.md`);
    } finally { snapshot.close(); }
  });

  it('cerrar dos veces no falla: el final del stream y una cancelación pueden coincidir', async () => {
    const snapshot = await openNotebookSnapshot(file);
    const before = exportTemporaries().length;
    snapshot.close();
    expect(() => { snapshot.close(); }).not.toThrow();
    expect(exportTemporaries().length).toBe(before - 1);
  });

  it('si la base de origen no existe, no deja ningún temporal detrás', async () => {
    const before = exportTemporaries().length;
    await expect(openNotebookSnapshot(join(directory, 'no-existe.db'))).rejects.toThrow();
    expect(exportTemporaries().length).toBe(before);
  });

  it('la copia es un fichero aparte: borrarla no toca la base original', async () => {
    note('Past modal verbs', '# Past modal verbs\n');
    const snapshot = await openNotebookSnapshot(file);
    snapshot.close();
    expect(existsSync(file)).toBe(true);
    expect(notebookZipEntries(db, NOW).some((entry) => entry.kind === 'note')).toBe(true);
  });
});
