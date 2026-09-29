import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JSON_DUMP_FORMAT_VERSION, toJsonDump } from '../export/dump';
import { createDb, type Db } from './client';
import { loadAnkiDataset, loadDataset } from './load';
import { migrate } from './migrate';
import {
  NOTEBOOK_MANIFEST_VERSION, notebookDumpChunks, notebookExportPaths, notebookManifest, notebookZipEntries,
} from './notebookExport';
import { setErrorNoteLink } from './notebookLinkRepo';
import { createNotebookFolder, createNotebookNote } from './notebookRepo';

const NOW = new Date('2026-09-29T10:00:00.000Z');
let db: Db;
let sessionId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
  sessionId = Number(db.$client.prepare(`INSERT INTO session
    (date, kind, paper, part, source, items_total, items_correct)
    VALUES ('2026-09-29', 'DRILL', 'RUOE', 4, 'LIBRO', 5, 4)`).run().lastInsertRowid);
});
afterEach(() => db.$client.close());

function folder(name: string, parentId: number | null = null): number {
  return createNotebookFolder(db, { name, parentId }, NOW.toISOString()).id;
}

function note(title: string, options: {
  readonly folderId?: number | null;
  readonly markdown?: string;
  readonly tags?: readonly string[];
} = {}) {
  return createNotebookNote(db, {
    uid: randomUUID(), title, folderId: options.folderId ?? null,
    tags: [...(options.tags ?? [])], contentMarkdown: options.markdown ?? `# ${title}\n`,
  }, NOW.toISOString()).note;
}

function error(): number {
  return Number(db.$client.prepare(`INSERT INTO error_row
    (session_id, prompt, correct_answer, cause, category, confidence, rule_note)
    VALUES (?, 'I must have...', 'must have', 'DESCONOCIMIENTO', 'ESTRUCTURA', 'DUDABA', 'Usar modal perfecto para deducciones pasadas')`)
    .run(sessionId).lastInsertRowid);
}

const entryPaths = (now = NOW) => notebookZipEntries(db, now).map((entry) => entry.path);
function read(path: string): string {
  const entry = notebookZipEntries(db, NOW).find((item) => item.path === path);
  return entry === undefined || entry.kind === 'directory' ? '' : entry.read();
}

describe('rutas del cuaderno', () => {
  it('anida dos niveles y deja los apuntes sin carpeta en la raíz', () => {
    const grammar = folder('Grammar');
    const modals = folder('Modal verbs', grammar);
    const first = note('Past modal verbs', { folderId: modals });
    const loose = note('Sin carpeta');

    const paths = notebookExportPaths(
      [
        { id: grammar, parentId: null, name: 'Grammar', nameKey: 'grammar', createdAt: '', updatedAt: '' },
        { id: modals, parentId: grammar, name: 'Modal verbs', nameKey: 'modal verbs', createdAt: '', updatedAt: '' },
      ],
      [first, loose],
    );
    expect(paths.folders.get(grammar)).toBe(`grammar--${String(grammar)}`);
    expect(paths.folders.get(modals)).toBe(`grammar--${String(grammar)}/modal-verbs--${String(modals)}`);
    expect(paths.notes.get(first.id)).toBe(`grammar--${String(grammar)}/modal-verbs--${String(modals)}/${String(first.id)}-past-modal-verbs.md`);
    expect(paths.notes.get(loose.id)).toBe(`${String(loose.id)}-sin-carpeta.md`);
  });

  it('dos apuntes con el mismo título en la misma carpeta no comparten fichero', () => {
    const where = folder('Grammar');
    const a = note('Igual', { folderId: where });
    const b = note('Igual', { folderId: where });
    const paths = entryPaths();
    expect(paths).toContain(`Notebook/grammar--${String(where)}/${String(a.id)}-igual.md`);
    expect(paths).toContain(`Notebook/grammar--${String(where)}/${String(b.id)}-igual.md`);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('entradas del ZIP', () => {
  it('lleva las carpetas, un .md por apunte y el manifiesto al final', () => {
    const grammar = folder('Grammar');
    const vacia = folder('Vacía', grammar);
    const first = note('Past modal verbs', { folderId: grammar });
    const entries = notebookZipEntries(db, NOW);

    expect(entries.map((entry) => entry.kind)).toEqual(['directory', 'directory', 'note', 'manifest']);
    expect(entries.map((entry) => entry.path)).toEqual([
      `Notebook/grammar--${String(grammar)}`,
      `Notebook/grammar--${String(grammar)}/vacía--${String(vacia)}`,
      `Notebook/grammar--${String(grammar)}/${String(first.id)}-past-modal-verbs.md`,
      'Notebook/manifest.json',
    ]);
  });

  it('una carpeta vacía se exporta igual: su entrada no depende de que tenga apuntes', () => {
    const solo = folder('Sola');
    expect(entryPaths()).toEqual([`Notebook/sola--${String(solo)}`, 'Notebook/manifest.json']);
  });

  it('un cuaderno vacío exporta solo el manifiesto', () => {
    expect(entryPaths()).toEqual(['Notebook/manifest.json']);
    expect(JSON.parse(read('Notebook/manifest.json'))).toMatchObject({ folders: [], notes: [], errorLinks: [] });
  });

  it('cada .md lleva su frontmatter y el cuerpo con los enlaces reescritos', () => {
    const grammar = folder('Grammar');
    const target = note('Collocations');
    const source = note('Past modal verbs', {
      folderId: grammar, tags: ['part4'],
      markdown: `# Past modal verbs\n\n## Must have\n\nVer [otro](/notebook/${String(target.id)}-collocations#nb-x) y [aquí](#nb-must-have).\n`,
    });

    const text = read(`Notebook/grammar--${String(grammar)}/${String(source.id)}-past-modal-verbs.md`);
    expect(text).toContain('title: "Past modal verbs"');
    expect(text).toContain(`notebook_uid: "${source.uid}"`);
    expect(text).toContain(`Ver [otro](../${String(target.id)}-collocations.md#x) y [aquí](#must-have).`);
  });

  it('el cuerpo solo se lee cuando el ZIP llega a esa entrada', () => {
    const first = note('Grande', { markdown: '# Grande\n\ncuerpo\n' });
    const entries = notebookZipEntries(db, NOW);
    // Construir la lista no toca los cuerpos: se puede cerrar y volver a abrir la lectura.
    const entry = entries.find((item) => item.path.endsWith(`${String(first.id)}-grande.md`));
    expect(entry?.kind === 'note' ? entry.read() : '').toContain('cuerpo');
  });
});

describe('manifiesto', () => {
  it('lleva versión, identidades, rutas, carpetas y metadata', () => {
    const grammar = folder('Grammar');
    const first = note('Past modal verbs', { folderId: grammar, tags: ['part4', 'modales'] });
    const manifest = notebookManifest(db, NOW);

    expect(manifest.formatVersion).toBe(NOTEBOOK_MANIFEST_VERSION);
    expect(manifest.exportedAt).toBe(NOW.toISOString());
    expect(manifest.folders).toEqual([
      { id: grammar, parentId: null, name: 'Grammar', path: `grammar--${String(grammar)}` },
    ]);
    expect(manifest.notes).toEqual([{
      id: first.id, uid: first.uid, title: 'Past modal verbs', tags: ['part4', 'modales'],
      folderId: grammar, path: `grammar--${String(grammar)}/${String(first.id)}-past-modal-verbs.md`,
      revision: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }]);
  });

  it('conserva los vínculos con errores y su apartado', () => {
    const first = note('Past modal verbs', { markdown: '# Past modal verbs\n\n## Must have\n' });
    const second = note('Otro');
    const errorId = error();
    setErrorNoteLink(db, { errorId, noteId: first.id, headingSlug: 'nb-must-have' }, NOW.toISOString());
    setErrorNoteLink(db, { errorId, noteId: second.id, headingSlug: null }, NOW.toISOString());

    expect(notebookManifest(db, NOW).errorLinks).toEqual([
      { errorId, noteId: first.id, headingSlug: 'nb-must-have', headingText: 'Must have', createdAt: NOW.toISOString() },
      { errorId, noteId: second.id, headingSlug: null, headingText: null, createdAt: NOW.toISOString() },
    ]);
  });

  it('el manifiesto del ZIP es JSON legible y acaba en salto de línea', () => {
    note('Uno');
    const text = read('Notebook/manifest.json');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "formatVersion": 2');
    expect(() => JSON.parse(text) as unknown).not.toThrow();
  });
});

describe('volcado JSON', () => {
  function dump(): string {
    const head = toJsonDump(loadDataset(db), NOW, loadAnkiDataset(db));
    return [...notebookDumpChunks(db, head)].join('');
  }

  it('conserva exportedAt, rows y anki, y añade formatVersion y notebook', () => {
    const parsed = JSON.parse(dump()) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['formatVersion', 'exportedAt', 'rows', 'anki', 'notebook']);
    expect(parsed['formatVersion']).toBe(JSON_DUMP_FORMAT_VERSION);
    expect(parsed['exportedAt']).toBe(NOW.toISOString());
  });

  it('lleva carpetas, apuntes con su cuerpo y vínculos', () => {
    const grammar = folder('Grammar');
    const first = note('Past modal verbs', { folderId: grammar, markdown: '# Past\n\ncuerpo íntegro\n' });
    const errorId = error();
    setErrorNoteLink(db, { errorId, noteId: first.id, headingSlug: null }, NOW.toISOString());

    const notebook = (JSON.parse(dump()) as { notebook: {
      folders: Array<{ id: number }>;
      notes: Array<{ id: number; contentMarkdown: string; uid: string; revision: number }>;
      errorLinks: Array<{ errorId: number; noteId: number }>;
    } }).notebook;
    expect(notebook.folders.map((item) => item.id)).toEqual([grammar]);
    expect(notebook.notes).toEqual([expect.objectContaining({
      id: first.id, uid: first.uid, revision: 1, contentMarkdown: '# Past\n\ncuerpo íntegro\n',
    })]);
    expect(notebook.errorLinks).toEqual([expect.objectContaining({ errorId, noteId: first.id })]);
  });

  it('el cuerpo del volcado no se reescribe: no hay árbol al que referirse', () => {
    const target = note('Otro');
    note('Origen', { markdown: `[x](/notebook/${String(target.id)}-otro#nb-h)\n` });
    expect(dump()).toContain(`[x](/notebook/${String(target.id)}-otro#nb-h)`);
  });

  it('varios apuntes salen separados por comas y el JSON sigue siendo válido', () => {
    note('Uno');
    note('Dos');
    note('Tres');
    const notebook = (JSON.parse(dump()) as { notebook: { notes: unknown[] } }).notebook;
    expect(notebook.notes).toHaveLength(3);
  });

  it('un cuaderno vacío deja las tres colecciones vacías', () => {
    expect(JSON.parse(dump())).toMatchObject({ notebook: { folders: [], notes: [], errorLinks: [] } });
  });
});
