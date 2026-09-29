import { analyzeNotebookMarkdown, normalizeNotebookSearchText } from '../notebook/markdown';
import type { Db } from './client';

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
