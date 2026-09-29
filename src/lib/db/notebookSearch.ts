import { inArray } from 'drizzle-orm';

import {
  analyzeNotebookMarkdown, findNotebookMarkdownExcerpt, findNotebookTextMatch, normalizeNotebookSearchText,
  type NotebookExcerpt,
} from '../notebook/markdown';
import {
  NOTEBOOK_LIMITS, notebookTagsSchema, searchNotebookSchema, type SearchNotebookInput,
} from '../notebook/schemas';
import type { NotebookNoteSummary, NotebookPage } from '../notebook/types';
import type { Db } from './client';
import { notebookNote } from './schema';

interface SearchRow {
  readonly id: number;
  readonly uid: string;
  readonly folder_id: number | null;
  readonly title: string;
  readonly tags: string;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * IDs de la página en su orden, sin leer ningún apunte. El registro de `notebook_note`
 * guarda el cuerpo antes de las etiquetas y de `updated_at`, así que ordenar leyendo las
 * filas recorría cada cuerpo coincidente; el índice `(updated_at, id)` ya tiene lo que hace
 * falta. Por lo mismo el rango sale de conjuntos del índice FTS y no de sus columnas, que
 * también arrastran el cuerpo: solo se lee el título para decidir el acierto exacto.
 */
function searchPageIds(
  db: Db,
  filters: { readonly folderId: number | null; readonly unfiledOnly?: boolean; readonly tag: string | null },
  query: string,
  offset: number,
): number[] {
  const conditions: string[] = [];
  const parameters: Record<string, string | number> = { limit: NOTEBOOK_LIMITS.pageSize + 1, offset };
  let hits = '';
  let from = 'notebook_note AS n INDEXED BY notebook_note_updated_id_idx';
  let rank = '';
  if (query !== '') {
    if ([...query].length >= 3 && /^[\p{L}\p{N} ]+$/u.test(query)) {
      // Con trigramas, una frase entre comillas es exactamente una subcadena de la columna:
      // lo mismo que comprobaría `instr`, pero resuelto en el índice.
      const phrase = `"${query.replaceAll('"', '""')}"`;
      conditions.push('n.id IN (SELECT rowid FROM notebook_note_fts WHERE notebook_note_fts MATCH :phrase)');
      rank = `CASE
        WHEN n.id IN (SELECT rowid FROM notebook_note_fts WHERE notebook_note_fts MATCH :inTitle)
          THEN CASE WHEN (SELECT title FROM notebook_note_fts WHERE rowid = n.id) = :query THEN 0 ELSE 1 END
        WHEN n.id IN (SELECT rowid FROM notebook_note_fts WHERE notebook_note_fts MATCH :inTags) THEN 2
        ELSE 3
      END,`;
      Object.assign(parameters, { phrase, query, inTitle: `{title} : ${phrase}`, inTags: `{tags} : ${phrase}` });
    } else {
      // Uno o dos caracteres no llegan a un trigrama: se recorre el texto normalizado una
      // sola vez y el rango se calcula en ese mismo recorrido.
      hits = `WITH hits(id, rank) AS MATERIALIZED (
        SELECT rowid, CASE WHEN title = :query THEN 0 WHEN instr(title, :query) > 0 THEN 1
          WHEN instr(tags, :query) > 0 THEN 2 ELSE 3 END
        FROM notebook_note_fts
        WHERE instr(title, :query) > 0 OR instr(body, :query) > 0 OR instr(tags, :query) > 0
      )`;
      from = `hits JOIN ${from} ON n.id = hits.id`;
      rank = 'hits.rank,';
      parameters['query'] = query;
    }
  }
  if (filters.folderId !== null) {
    conditions.push('(n.folder_id = :folderId OR n.folder_id IN (SELECT id FROM notebook_folder WHERE parent_id = :folderId))');
    parameters['folderId'] = filters.folderId;
  }
  if (filters.unfiledOnly === true) conditions.push('n.folder_id IS NULL');
  if (filters.tag !== null) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(n.tags) AS tag WHERE tag.value = :tag)');
    parameters['tag'] = filters.tag;
  }
  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
  return db.$client.prepare<[Record<string, string | number>], { id: number }>(`
    ${hits}
    SELECT n.id FROM ${from}
    ${where}
    ORDER BY ${rank} n.updated_at DESC, n.id DESC
    LIMIT :limit OFFSET :offset
  `).all(parameters).map((row) => row.id);
}

/** Consulta corta por subcadena; desde tres caracteres ordinarios, FTS reduce candidatos. */
export function searchNotebookNotes(db: Db, input: SearchNotebookInput): NotebookPage<NotebookNoteSummary> {
  const filters = searchNotebookSchema.parse(input);
  const query = normalizeNotebookSearchText(filters.query);
  const offset = (filters.page - 1) * NOTEBOOK_LIMITS.pageSize;
  if (!Number.isSafeInteger(offset)) return { items: [], hasMore: false };
  // Una sola lectura: los IDs y sus filas salen del mismo estado de la base.
  return db.$client.transaction(() => {
    const ids = searchPageIds(db, filters, query, offset);
    const page = ids.slice(0, NOTEBOOK_LIMITS.pageSize);
    if (page.length === 0) return { items: [], hasMore: false };
    const rows = db.$client.prepare<number[], SearchRow>(`
      SELECT id, uid, folder_id, title, tags, revision, created_at, updated_at
      FROM notebook_note WHERE id IN (${page.map(() => '?').join(', ')})
    `).all(...page);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = page.flatMap((id) => {
      const row = byId.get(id);
      return row === undefined ? [] : [{
        id: row.id,
        uid: row.uid,
        folderId: row.folder_id,
        title: row.title,
        tags: notebookTagsSchema.parse(JSON.parse(row.tags)),
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }];
    });
    return { items, hasMore: ids.length > NOTEBOOK_LIMITS.pageSize };
  })();
}

export interface NotebookSearchHit {
  readonly note: NotebookNoteSummary;
  readonly excerpt: NotebookExcerpt | null;
  readonly matchedIn: 'title' | 'tag' | 'body' | null;
}

/** Carga cuerpos exclusivamente para los 20 resultados de esta página. */
export function searchNotebookHits(db: Db, input: SearchNotebookInput): NotebookPage<NotebookSearchHit> {
  const page = searchNotebookNotes(db, input);
  const query = normalizeNotebookSearchText(input.query);
  if (page.items.length === 0) return { items: [], hasMore: page.hasMore };
  if (query === '') {
    return { items: page.items.map((note) => ({ note, excerpt: null, matchedIn: null })), hasMore: page.hasMore };
  }
  const ids = page.items.map((note) => note.id);
  const contents = db.select({ id: notebookNote.id, markdown: notebookNote.contentMarkdown })
    .from(notebookNote).where(inArray(notebookNote.id, ids)).all();
  const markdownById = new Map(contents.map((row) => [row.id, row.markdown]));
  return {
    items: page.items.map((note) => {
      const excerpt = findNotebookMarkdownExcerpt(markdownById.get(note.id) ?? '', query);
      const matchedIn = findNotebookTextMatch(note.title, query) !== null ? 'title'
        : note.tags.some((tag) => findNotebookTextMatch(tag, query) !== null) ? 'tag'
          : excerpt === null ? null : 'body';
      return { note, excerpt, matchedIn };
    }),
    hasMore: page.hasMore,
  };
}

/** Reconstrucción atómica del índice derivado, sin cargar todos los cuerpos en memoria. */
export function rebuildNotebookSearch(db: Db): number {
  const sqlite = db.$client;
  return sqlite.transaction(() => {
    sqlite.exec('DELETE FROM notebook_note_fts');
    const read = sqlite.prepare<[number], {
      id: number;
      title: string;
      content_markdown: string;
      tags: string;
    }>('SELECT id, title, content_markdown, tags FROM notebook_note WHERE id > ? ORDER BY id LIMIT 100');
    const insert = sqlite.prepare<[number, string, string, string]>(
      'INSERT INTO notebook_note_fts (rowid, title, body, tags) VALUES (?, ?, ?, ?)',
    );
    let count = 0;
    let lastId = 0;
    while (true) {
      const batch = read.all(lastId);
      if (batch.length === 0) break;
      for (const row of batch) {
        const tags: unknown = JSON.parse(row.tags);
        if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
          throw new Error(`Etiquetas inválidas en el apunte ${String(row.id)}`);
        }
        insert.run(
          row.id,
          normalizeNotebookSearchText(row.title),
          analyzeNotebookMarkdown(row.content_markdown).searchText,
          normalizeNotebookSearchText(tags.join(' ')),
        );
        lastId = row.id;
        count += 1;
      }
    }
    return count;
  }).immediate();
}
