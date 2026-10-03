import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeFolderNameKey } from '../notebook/schemas';
import { createDb, type Db } from './client';
import { migrate } from './migrate';

const NOW = '2026-09-29T07:00:00.000Z';
let db: Db;
let nextUid = 0;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
  nextUid = 0;
});
afterEach(() => db.$client.close());

function folder(name: string, parentId: number | null = null): number {
  return Number(db.$client.prepare(`INSERT INTO notebook_folder
    (name, name_key, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(name, normalizeFolderNameKey(name), parentId, NOW, NOW).lastInsertRowid);
}

function note(folderId: number | null = null): number {
  nextUid += 1;
  return Number(db.$client.prepare(`INSERT INTO notebook_note
    (uid, folder_id, title, content_markdown, tags, created_at, updated_at)
    VALUES (?, ?, 'Past modal verbs', '# Must have', '[]', ?, ?)`)
    .run(`9c8de1e3-03e6-42ec-a098-${String(nextUid).padStart(12, '0')}`,
      folderId, NOW, NOW).lastInsertRowid);
}

function error(): number {
  const sessionId = Number(db.$client.prepare(`INSERT INTO session
    (date, kind, paper, part, source, items_total, items_correct)
    VALUES ('2026-09-29', 'DRILL', 'RUOE', 4, 'LIBRO', 5, 4)`)
    .run().lastInsertRowid);
  return Number(db.$client.prepare(`INSERT INTO error_row
    (session_id, prompt, correct_answer, cause, category, confidence, rule_note)
    VALUES (?, 'I must have...', 'must have', 'DESCONOCIMIENTO', 'ESTRUCTURA',
      'DUDABA', 'Usar modal perfecto para deducciones pasadas')`)
    .run(sessionId).lastInsertRowid);
}

describe('migración Notebook y restricciones SQLite', () => {
  it('crea las tres tablas y permite migrar dos veces sin cambios', () => {
    expect(db.$client.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name IN
        ('notebook_error_link', 'notebook_folder', 'notebook_note') ORDER BY name`).all())
      .toEqual([
        { name: 'notebook_error_link' },
        { name: 'notebook_folder' },
        { name: 'notebook_note' },
      ]);
    expect(db.$client.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'notebook_note_fts'`).get())
      .toEqual({ name: 'notebook_note_fts' });
    const before = db.$client.prepare('SELECT * FROM __drizzle_migrations').all();
    migrate(db);
    expect(db.$client.prepare('SELECT * FROM __drizzle_migrations').all()).toEqual(before);
  });

  it('separa unicidad de nombres por padre y protege el segundo nivel', () => {
    const grammar = folder('Grammar');
    const vocabulary = folder('Vocabulary');
    expect(() => folder('GRAMMAR')).toThrow(/UNIQUE/i);
    const modal = folder('Modal verbs', grammar);
    expect(() => folder('modal VERBS', grammar)).toThrow(/UNIQUE/i);
    expect(() => folder('Modal verbs', vocabulary)).not.toThrow();
    expect(() => folder('Third level', modal)).toThrow(/notebook_folder_depth/);
    expect(() => db.$client.prepare('UPDATE notebook_folder SET parent_id = ? WHERE id = ?')
      .run(vocabulary, grammar)).toThrow(/notebook_folder_depth/);
    expect(() => db.$client.prepare('UPDATE notebook_folder SET parent_id = ? WHERE id = ?')
      .run(modal, modal)).toThrow(/CHECK|notebook_folder_depth/i);
  });

  it('permite mover una carpeta hoja entre raíz y segundo nivel', () => {
    const root = folder('Grammar');
    const leaf = folder('Tenses');
    db.$client.prepare('UPDATE notebook_folder SET parent_id = ? WHERE id = ?').run(root, leaf);
    expect(db.$client.prepare('SELECT parent_id FROM notebook_folder WHERE id = ?').get(leaf))
      .toEqual({ parent_id: root });
    db.$client.prepare('UPDATE notebook_folder SET parent_id = NULL WHERE id = ?').run(leaf);
    expect(db.$client.prepare('SELECT parent_id FROM notebook_folder WHERE id = ?').get(leaf))
      .toEqual({ parent_id: null });
  });

  it('restringe borrado de carpetas ocupadas y valida contenido, tags y revisión', () => {
    const root = folder('Grammar');
    const child = folder('Modal verbs', root);
    const noteId = note(child);
    expect(() => db.$client.prepare('DELETE FROM notebook_folder WHERE id = ?').run(root))
      .toThrow(/FOREIGN KEY/i);
    expect(() => db.$client.prepare('DELETE FROM notebook_folder WHERE id = ?').run(child))
      .toThrow(/FOREIGN KEY/i);
    expect(() => db.$client.prepare('UPDATE notebook_note SET tags = ? WHERE id = ?')
      .run('{invalid', noteId)).toThrow(/CHECK/i);
    expect(() => db.$client.prepare('UPDATE notebook_note SET tags = ? WHERE id = ?')
      .run('{}', noteId)).toThrow(/CHECK/i);
    expect(() => db.$client.prepare('UPDATE notebook_note SET tags = ? WHERE id = ?')
      .run(JSON.stringify(Array.from({ length: 13 }, (_, i) => String(i))), noteId))
      .toThrow(/CHECK/i);
    expect(() => db.$client.prepare('UPDATE notebook_note SET revision = 0 WHERE id = ?')
      .run(noteId)).toThrow(/CHECK/i);
    expect(() => db.$client.prepare('UPDATE notebook_note SET content_markdown = ? WHERE id = ?')
      .run('á'.repeat(131073), noteId)).toThrow(/CHECK/i);
    expect(db.$client.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });

  it('conserva extremos y elimina solo vínculos en las cascadas', () => {
    const noteId = note();
    const errorId = error();
    db.$client.prepare(`INSERT INTO notebook_error_link
      (error_id, note_id, heading_slug, heading_text, created_at)
      VALUES (?, ?, 'nb-must-have', 'Must have', ?)`)
      .run(errorId, noteId, NOW);
    expect(() => db.$client.prepare(`INSERT INTO notebook_error_link
      (error_id, note_id, heading_slug, created_at) VALUES (?, ?, 'nb-x', ?)`)
      .run(errorId, noteId, NOW)).toThrow(/CHECK|UNIQUE/i);
    db.$client.prepare('DELETE FROM error_row WHERE id = ?').run(errorId);
    expect(db.$client.prepare('SELECT * FROM notebook_error_link').all()).toEqual([]);
    expect(db.$client.prepare('SELECT id FROM notebook_note WHERE id = ?').get(noteId))
      .toEqual({ id: noteId });
    const secondError = error();
    db.$client.prepare(`INSERT INTO notebook_error_link
      (error_id, note_id, created_at) VALUES (?, ?, ?)`)
      .run(secondError, noteId, NOW);
    db.$client.prepare('DELETE FROM notebook_note WHERE id = ?').run(noteId);
    expect(db.$client.prepare('SELECT * FROM notebook_error_link').all()).toEqual([]);
    expect(db.$client.prepare('SELECT id FROM error_row WHERE id = ?').get(secondError))
      .toEqual({ id: secondError });
    expect(db.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
