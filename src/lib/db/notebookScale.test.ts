import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { notebookZipEntries } from './notebookExport';
import {
  growNotebookFixture, notebookFixtureMarker, summarizeNotebookFixture,
} from './notebookFixtures';
import { getErrorNoteLinks, listNoteErrorLinks } from './notebookLinkRepo';
import { getNotebookNote, listNotebookNotes, listRecentNotebookNotes } from './notebookRepo';
import { searchNotebookHits, searchNotebookNotes } from './notebookSearch';
import { loadDataset } from './load';
import { seed } from './seed';

/**
 * «Carga acotada» (TASK 7.2), sin cronómetro: lo que se cuenta son las filas que cada
 * sentencia devuelve a JavaScript. Con un cuaderno de muchas páginas, ninguna pantalla
 * debe leer más que su página, y el ZIP no debe tener más de un cuerpo en la mano.
 *
 * Los tiempos de verdad, a 50, 500 y 5.000 apuntes, los da `pnpm bench:notebook`.
 */

const NOTES = 260;
const PAGE = 20;

interface Read {
  readonly sql: string;
  rows: number;
  params: readonly unknown[] | null;
}

/** Ejecuta `task` apuntando, por sentencia, cuántas filas devolvió y con qué parámetros. */
function captureReads<T>(db: Db, task: () => T): { readonly result: T; readonly reads: readonly Read[] } {
  const client = db.$client;
  const prepare = client.prepare.bind(client);
  const reads: Read[] = [];
  const spy = vi.spyOn(client, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source);
    const read: Read = { sql: source, rows: 0, params: null };
    reads.push(read);
    const all = statement.all.bind(statement);
    const get = statement.get.bind(statement);
    statement.all = ((...params: unknown[]) => {
      read.params ??= params;
      const rows = all(...params);
      read.rows += rows.length;
      return rows;
    }) as typeof statement.all;
    statement.get = ((...params: unknown[]) => {
      read.params ??= params;
      const row = get(...params);
      if (row !== undefined) read.rows += 1;
      return row;
    }) as typeof statement.get;
    return statement;
  }) as typeof client.prepare);
  try {
    return { result: task(), reads };
  } finally { spy.mockRestore(); }
}

const bodyReads = (reads: readonly Read[]) => reads.filter((read) => /content_markdown/u.test(read.sql));
const totalRows = (reads: readonly Read[]) => reads.reduce((total, read) => total + read.rows, 0);

function plan(db: Db, read: Read): string {
  return db.$client.prepare(`EXPLAIN QUERY PLAN ${read.sql}`).all(...(read.params ?? []))
    .map((row) => (row as { detail: string }).detail).join('\n');
}

let db: Db;
let folderId: number;
let errorId: number;

beforeAll(() => {
  db = createDb(':memory:');
  migrate(db);
  seed(db, new Date('2026-09-29T08:00:00.000Z'));
  const errorIds = loadDataset(db).errors.map((error) => error.id);
  errorId = errorIds[0] ?? 0;
  growNotebookFixture(db, NOTES, { profile: 'compact', errorIds: [errorId] });
  folderId = db.$client.prepare<[], { folder_id: number }>(`SELECT folder_id FROM notebook_note
    WHERE folder_id IS NOT NULL GROUP BY folder_id ORDER BY count(*) DESC LIMIT 1`).get()?.folder_id ?? 0;
});

afterAll(() => db.$client.close());

describe('cuaderno de prueba', () => {
  it('crece de forma determinista: ampliar por tramos da el mismo cuaderno que de una vez', () => {
    const stepwise = createDb(':memory:');
    const direct = createDb(':memory:');
    try {
      migrate(stepwise);
      migrate(direct);
      growNotebookFixture(stepwise, 12, { profile: 'compact' });
      const grown = growNotebookFixture(stepwise, 30, { profile: 'compact' });
      growNotebookFixture(direct, 30, { profile: 'compact' });
      const rows = (target: Db) => target.$client.prepare(
        'SELECT uid, title, tags, content_markdown, updated_at FROM notebook_note ORDER BY uid').all();
      expect(rows(stepwise)).toEqual(rows(direct));
      expect(grown).toEqual(summarizeNotebookFixture(direct));
      expect(grown.notes).toBe(30);
      // Volver a pedir el mismo tamaño no añade nada.
      expect(growNotebookFixture(stepwise, 30, { profile: 'compact' })).toEqual(grown);
    } finally {
      stepwise.$client.close();
      direct.$client.close();
    }
  });

  it('reparte tamaños de un cuaderno real y añade carpetas al crecer', () => {
    const target = createDb(':memory:');
    try {
      migrate(target);
      const small = growNotebookFixture(target, 120);
      expect(small.folders).toBe(9);
      const sizes = target.$client.prepare<[], { bytes: number }>(
        'SELECT length(CAST(content_markdown AS BLOB)) AS bytes FROM notebook_note').all().map((row) => row.bytes);
      // La mayoría caben en una pantalla, pero hay apuntes largos y alguno de referencia.
      expect(sizes.filter((bytes) => bytes < 4096).length).toBeGreaterThan(sizes.length / 2);
      expect(sizes.some((bytes) => bytes > 32 * 1024)).toBe(true);
      const unfiled = target.$client.prepare<[], { total: number }>(
        'SELECT count(*) AS total FROM notebook_note WHERE folder_id IS NULL').get()?.total ?? 0;
      expect(unfiled).toBeGreaterThan(0);
      expect(growNotebookFixture(target, 760, { profile: 'compact' }).folders).toBe(12);
    } finally { target.$client.close(); }
  });

  it('cada apunte lleva un marcador propio que sirve de búsqueda rara', () => {
    const page = searchNotebookNotes(db, { query: notebookFixtureMarker(7), folderId: null, tag: null, page: 1 });
    expect(page.items).toHaveLength(1);
    expect(summarizeNotebookFixture(db)).toMatchObject({ notes: NOTES, links: NOTES / 10 });
  });
});

describe('carga acotada con un cuaderno de muchas páginas', () => {
  it('la portada lee solo los recientes que enseña, sin cuerpos', () => {
    const { reads } = captureReads(db, () => listRecentNotebookNotes(db));
    expect(totalRows(reads)).toBe(PAGE);
    expect(bodyReads(reads)).toHaveLength(0);
  });

  it('una carpeta lee su página y una fila de más para saber si hay otra', () => {
    const { result, reads } = captureReads(db, () => listNotebookNotes(db, folderId, 1));
    expect(result.hasMore).toBe(true);
    expect(totalRows(reads)).toBe(PAGE + 1);
    expect(bodyReads(reads)).toHaveLength(0);
  });

  it('buscar algo que está en todos los apuntes lee una página y solo los cuerpos de esa página', () => {
    const { result, reads } = captureReads(db, () =>
      searchNotebookHits(db, { query: 'referencia interna', folderId: null, tag: null, page: 2 }));
    expect(result.items).toHaveLength(PAGE);
    expect(result.hasMore).toBe(true);
    expect(Math.max(...reads.map((read) => read.rows))).toBeLessThanOrEqual(PAGE + 1);
    expect(totalRows(bodyReads(reads))).toBeLessThanOrEqual(PAGE);
  });

  it('la paleta y el selector de vínculos buscan sin tocar ningún cuerpo', () => {
    for (const query of ['referencia interna', 'la']) {
      const { reads } = captureReads(db, () =>
        searchNotebookNotes(db, { query, folderId: null, tag: null, page: 1 }));
      // Los IDs de la página y uno más, y después solo las veinte filas que se enseñan.
      expect(reads.map((read) => read.rows).filter((rows) => rows > 0)).toEqual([PAGE + 1, PAGE]);
      expect(bodyReads(reads)).toHaveLength(0);
    }
  });

  it('el lector y los vínculos leen un apunte y una página de errores', () => {
    const note = listRecentNotebookNotes(db, 1)[0];
    if (note === undefined) throw new Error('Cuaderno vacío');
    expect(totalRows(captureReads(db, () => getNotebookNote(db, note.id)).reads)).toBe(1);
    expect(totalRows(captureReads(db, () => listNoteErrorLinks(db, note.id, 1)).reads)).toBeLessThanOrEqual(PAGE + 1);
    // El panel del error enumera sus apuntes: los que cita ese error, no el cuaderno.
    const { result, reads } = captureReads(db, () => getErrorNoteLinks(db, errorId));
    expect(result).toHaveLength(NOTES / 10);
    expect(totalRows(bodyReads(reads))).toBeLessThanOrEqual(NOTES / 10);
  });

  it('el ZIP enumera cabeceras sin cuerpos y después lee cada cuerpo de uno en uno', () => {
    const { result: entries, reads } = captureReads(db, () => notebookZipEntries(db, new Date()));
    expect(bodyReads(reads)).toHaveLength(0);
    const notes = entries.flatMap((entry) => entry.kind === 'note' ? [entry] : []);
    expect(notes).toHaveLength(NOTES);
    for (const entry of notes.slice(0, 25)) {
      const { reads: bodies } = captureReads(db, () => entry.read());
      expect(totalRows(bodyReads(bodies))).toBe(1);
    }
  });

  it('los listados recorren su índice en orden y no ordenan la tabla entera', () => {
    const recent = captureReads(db, () => listRecentNotebookNotes(db)).reads[0];
    const folder = captureReads(db, () => listNotebookNotes(db, folderId, 1)).reads[0];
    const unfiled = captureReads(db, () => listNotebookNotes(db, null, 1)).reads[0];
    if (recent === undefined || folder === undefined || unfiled === undefined) throw new Error('Sin consultas');
    expect(plan(db, recent)).toMatch(/notebook_note_updated_id_idx/u);
    expect(plan(db, folder)).toMatch(/notebook_note_folder_title_id_idx/u);
    expect(plan(db, unfiled)).toMatch(/notebook_note_folder_title_id_idx/u);
    for (const read of [recent, folder, unfiled]) expect(plan(db, read)).not.toMatch(/TEMP B-TREE/u);
  });

  it('la búsqueda ordena con el índice de modificación y no recorre las filas de los apuntes', () => {
    const { reads } = captureReads(db, () =>
      searchNotebookNotes(db, { query: 'referencia interna', folderId: folderId, tag: null, page: 1 }));
    const ids = reads.find((read) => /ORDER BY/u.test(read.sql));
    if (ids === undefined) throw new Error('Sin consulta de IDs');
    const detail = plan(db, ids);
    expect(detail).toMatch(/notebook_note_updated_id_idx/u);
    // Las filas enteras llevan el cuerpo delante de `updated_at`: la consulta de IDs no las lee.
    expect(detail).not.toMatch(/SEARCH n USING INTEGER PRIMARY KEY/u);
  });
});
