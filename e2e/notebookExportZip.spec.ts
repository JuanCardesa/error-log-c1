import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { setErrorNoteLink } from '../src/lib/db/notebookLinkRepo';
import {
  createNotebookFolder, createNotebookNote, deleteNotebookFolder, deleteNotebookNote, getNotebookNote,
} from '../src/lib/db/notebookRepo';
import { E2E_DB } from './globalSetup';
import { readZipEntries } from './zip';

/** El servidor de los e2e corre en este mismo proceso, así que sus temporales se ven aquí. */
const exportTemporaries = () => readdirSync(tmpdir()).filter((name) => name.startsWith('errorlog-export-'));

interface Fixture {
  readonly grammar: number;
  readonly modals: number;
  readonly empty: number;
  readonly sourceId: number;
  readonly targetId: number;
  readonly errorId: number;
  readonly suffix: string;
}

function build(): Fixture {
  const db = createDb(E2E_DB);
  try {
    const at = new Date().toISOString();
    const suffix = randomUUID().slice(0, 8);
    const grammar = createNotebookFolder(db, { name: `Grammar ${suffix}`, parentId: null }, at).id;
    const modals = createNotebookFolder(db, { name: 'Modal verbs', parentId: grammar }, at).id;
    const empty = createNotebookFolder(db, { name: 'Vacía', parentId: grammar }, at).id;

    const target = createNotebookNote(db, {
      uid: randomUUID(), title: `Collocations ${suffix}`, folderId: null, tags: [],
      contentMarkdown: '# Collocations\n\n## Verbos\n\nTexto.\n',
    }, at).note;
    const source = createNotebookNote(db, {
      uid: randomUUID(), title: `Past modals ${suffix}`, folderId: modals, tags: ['part4', 'modales'],
      contentMarkdown: [
        '# Past modals', '', '## Must have', '',
        `Ver [colocaciones](/notebook/${String(target.id)}-collocations#nb-verbos).`, '',
        'Y [este apartado](#nb-must-have), un [externo](https://example.com) y `[literal](/notebook/1-x)`.', '',
      ].join('\n'),
    }, at).note;

    const errorRow = loadDataset(db).errors[0];
    if (errorRow === undefined) throw new Error('Falta un error en el seed');
    setErrorNoteLink(db, { errorId: errorRow.id, noteId: source.id, headingSlug: 'nb-must-have' }, at);

    return { grammar, modals, empty, sourceId: source.id, targetId: target.id, errorId: errorRow.id, suffix };
  } finally { db.$client.close(); }
}

function cleanup(fixture: Fixture): void {
  const db = createDb(E2E_DB);
  try {
    for (const id of [fixture.sourceId, fixture.targetId]) {
      const note = getNotebookNote(db, id);
      if (note !== null) deleteNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision });
    }
    for (const id of [fixture.empty, fixture.modals, fixture.grammar]) deleteNotebookFolder(db, id);
  } finally { db.$client.close(); }
}

test('el ZIP del cuaderno lleva el árbol, el manifiesto y los enlaces en relativo', async ({ page }) => {
  const fixture = build();
  const grammarDir = `Notebook/grammar-${fixture.suffix}--${String(fixture.grammar)}`;
  try {
    await page.goto('/exportar');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar el cuaderno en ZIP' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('errorlog-notebook.zip');

    const entries = readZipEntries(readFileSync(await saved.path()));
    const names = [...entries.keys()];
    const sourcePath = `${grammarDir}/modal-verbs--${String(fixture.modals)}/${String(fixture.sourceId)}-past-modals-${fixture.suffix}.md`;
    const targetPath = `Notebook/${String(fixture.targetId)}-collocations-${fixture.suffix}.md`;

    expect(names).toContain(sourcePath);
    expect(names).toContain(targetPath);
    expect(names).toContain('Notebook/manifest.json');
    // La carpeta vacía también viaja, con su barra final.
    expect(names).toContain(`${grammarDir}/vacía--${String(fixture.empty)}/`);

    const source = entries.get(sourcePath)?.toString('utf8') ?? '';
    expect(source).toContain(`title: "Past modals ${fixture.suffix}"`);
    expect(source).toContain('  - "part4"');
    // Enlace a otro apunte en relativo y anclas a la convención de GitHub.
    expect(source).toContain(`Ver [colocaciones](../../${String(fixture.targetId)}-collocations-${fixture.suffix}.md#verbos).`);
    expect(source).toContain('[este apartado](#must-have)');
    expect(source).toContain('[externo](https://example.com)');
    // Lo que no es un enlace se queda igual.
    expect(source).toContain('`[literal](/notebook/1-x)`');

    const manifest = JSON.parse(entries.get('Notebook/manifest.json')?.toString('utf8') ?? '{}') as {
      formatVersion: number;
      folders: Array<{ id: number; parentId: number | null; path: string }>;
      notes: Array<{ id: number; uid: string; path: string; revision: number; tags: string[] }>;
      errorLinks: Array<{ errorId: number; noteId: number; headingSlug: string | null; headingText: string | null }>;
    };
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.folders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.empty, parentId: fixture.grammar }),
    ]));
    expect(manifest.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.sourceId, path: sourcePath.replace('Notebook/', ''), revision: 1, tags: ['part4', 'modales'] }),
    ]));
    expect(manifest.errorLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorId: fixture.errorId, noteId: fixture.sourceId,
        headingSlug: 'nb-must-have', headingText: 'Must have',
      }),
    ]));
  } finally { cleanup(fixture); }
});

test('el volcado JSON añade formatVersion y el cuaderno sin recortar los cuerpos', async ({ page }) => {
  const fixture = build();
  try {
    const response = await page.request.get('/exportar/dump.json');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-disposition']).toContain('errorlog-dump.json');

    const dump = JSON.parse(await response.text()) as {
      formatVersion: number;
      exportedAt: string;
      rows: { errors: unknown[] };
      anki: Record<string, unknown>;
      notebook: {
        folders: Array<{ id: number }>;
        notes: Array<{ id: number; contentMarkdown: string }>;
        errorLinks: Array<{ noteId: number }>;
      };
    };
    expect(Object.keys(dump)).toEqual(['formatVersion', 'exportedAt', 'rows', 'anki', 'notebook']);
    expect(dump.formatVersion).toBe(2);
    expect(dump.rows.errors.length).toBeGreaterThan(0);

    const source = dump.notebook.notes.find((note) => note.id === fixture.sourceId);
    // En el volcado el cuerpo va tal cual: no hay árbol de ficheros al que referirse.
    expect(source?.contentMarkdown).toContain(`[colocaciones](/notebook/${String(fixture.targetId)}-collocations#nb-verbos)`);
    expect(dump.notebook.folders.map((folder) => folder.id)).toContain(fixture.grammar);
    expect(dump.notebook.errorLinks.map((link) => link.noteId)).toContain(fixture.sourceId);
  } finally { cleanup(fixture); }
});

test('cancelar la descarga no deja copias temporales de la base', async ({ page }) => {
  const fixture = build();
  try {
    await page.goto('/exportar');
    const before = exportTemporaries().length;

    const status = await page.evaluate(async () => {
      const controller = new AbortController();
      const response = await fetch('/exportar/notebook.zip', { signal: controller.signal });
      // Se aborta sin leer el cuerpo: el servidor debe cerrar y borrar su copia.
      controller.abort();
      return response.status;
    });
    expect(status).toBe(200);

    await expect.poll(() => exportTemporaries().length, { timeout: 15_000 }).toBe(before);
  } finally { cleanup(fixture); }
});
