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

/** Consulta corta por subcadena; desde tres caracteres ordinarios, FTS reduce candidatos. */
export function searchNotebookNotes(db: Db, input: SearchNotebookInput): NotebookPage<NotebookNoteSummary> {
  const filters = searchNotebookSchema.parse(input);
  const query = normalizeNotebookSearchText(filters.query);
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];
  if (query !== '') {
    if ([...query].length >= 3 && /^[\p{L}\p{N} ]+$/u.test(query)) {
      conditions.push('n.id IN (SELECT rowid FROM notebook_note_fts WHERE notebook_note_fts MATCH ?)');
      parameters.push(`"${query.replaceAll('"', '""')}"`);
    }
    conditions.push('(instr(f.title, ?) > 0 OR instr(f.body, ?) > 0 OR instr(f.tags, ?) > 0)');
    parameters.push(query, query, query);
  }
  if (filters.folderId !== null) {
    conditions.push(`(n.folder_id = ? OR n.folder_id IN
      (SELECT id FROM notebook_folder WHERE parent_id = ?))`);
    parameters.push(filters.folderId, filters.folderId);
  }
  if (filters.unfiledOnly === true) conditions.push('n.folder_id IS NULL');
  if (filters.tag !== null) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(n.tags) AS tag WHERE tag.value = ?)');
    parameters.push(filters.tag);
  }
  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
  const rank = query === '' ? '' : `
    CASE
      WHEN f.title = ? THEN 0
      WHEN instr(f.title, ?) > 0 THEN 1
      WHEN instr(f.tags, ?) > 0 THEN 2
      ELSE 3
    END,`;
  if (query !== '') parameters.push(query, query, query);
  const offset = (filters.page - 1) * NOTEBOOK_LIMITS.pageSize;
  if (!Number.isSafeInteger(offset)) return { items: [], hasMore: false };
  parameters.push(NOTEBOOK_LIMITS.pageSize + 1, offset);
  const rows = db.$client.prepare<Array<string | number>, SearchRow>(`
    SELECT n.id, n.uid, n.folder_id, n.title, n.tags, n.revision, n.created_at, n.updated_at
    FROM notebook_note AS n
    JOIN notebook_note_fts AS f ON f.rowid = n.id
    ${where}
    ORDER BY ${rank} n.updated_at DESC, n.id DESC
    LIMIT ? OFFSET ?
  `).all(...parameters);
  const items = rows.slice(0, NOTEBOOK_LIMITS.pageSize).map((row) => ({
    id: row.id,
    uid: row.uid,
    folderId: row.folder_id,
    title: row.title,
    tags: notebookTagsSchema.parse(JSON.parse(row.tags)),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return { items, hasMore: rows.length > NOTEBOOK_LIMITS.pageSize };
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
