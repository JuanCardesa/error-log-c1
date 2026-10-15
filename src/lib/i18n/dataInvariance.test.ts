import { expect, it } from 'vitest';

import { createDb } from '../db/client';
import { loadDataset } from '../db/load';
import { migrate } from '../db/migrate';
import { createNotebookNote } from '../db/notebookRepo';
import { MIGRATIONS_DIR } from '../db/paths';
import { importSessionWithErrors } from '../db/sessionImport';
import { parseImportedBatch } from '../import/errors';
import { notebookNoteToMarkdown } from '../notebook/export';
import { parseNotebookMarkdownImport } from '../notebook/import';
import { getMessages } from './index';

const en = getMessages('en');
const es = getMessages('es');
const today = '2026-10-15';
const session = {
  date: today, kind: 'DRILL', paper: 'RUOE', part: 4, source: 'LIBRO',
  sourceRef: 'Unidad 2 · ¿Qué cambió?', itemsTotal: 6, itemsCorrect: 5, timed: true,
};
const error = {
  itemRef: '1', prompt: 'They called ___ the meeting.', myAnswer: 'of', correctAnswer: 'off',
  category: 'PHRASAL_VERB', subcategory: 'Verbos con off', cause: 'CONFUSION', confidence: 'SEGURO',
  ruleNote: 'Call off significa cancelar; conserva esta regla en español.', lateInSession: true,
};

it('el mismo JSON conserva sus datos y su identidad al reintentarlo en otro idioma', () => {
  const source = JSON.stringify({ session, errors: [error] });
  const english = parseImportedBatch(source, en, today);
  const spanish = parseImportedBatch(source, es, today);
  expect(english).toEqual({ session, errors: [error] });
  expect(spanish).toEqual(english);

  const db = createDb(':memory:');
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const options = { today, durationMin: 12, importId: 'fdb6db6f-f459-4b80-b0d8-a49ab72e3ccb' };
    const first = importSessionWithErrors(db, english, { ...options, t: en });
    expect(first.ok).toBe(true);
    const saved = loadDataset(db);
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0]).toMatchObject(session);
    expect(saved.errors).toHaveLength(1);
    expect(saved.errors[0]).toMatchObject(error);

    const retry = importSessionWithErrors(db, spanish, { ...options, t: es });
    expect(retry.ok).toBe(true);
    expect(retry.createdId).toBe(first.createdId);
    expect(retry.message).not.toBe(first.message);
    expect(loadDataset(db)).toEqual(saved);
  } finally { db.$client.close(); }
});

it.each([
  'Ítem\tEnunciado\tMi respuesta\tCorrecta\tCategoría\tRegla',
  'Item\tPrompt\tMy answer\tCorrect answer\tCategory\tRule note',
])('las cabeceras TSV se aceptan sin traducir las celdas: %s', (headers) => {
  const source = `${headers}\n1\t${error.prompt}\t${error.myAnswer}\t${error.correctAnswer}\t${error.category}\t${error.ruleNote}`;
  const english = parseImportedBatch(source, en, today);
  expect(parseImportedBatch(source, es, today)).toEqual(english);
  expect(english.errors[0]).toMatchObject({
    prompt: error.prompt, myAnswer: error.myAnswer, correctAnswer: error.correctAnswer,
    category: error.category, ruleNote: error.ruleNote,
  });
});

it('los avisos Markdown cambian de idioma, pero el apunte guardado y su exportación no', () => {
  const body = '# Deducción\r\n\r\n\tMust have — «pasado»\r\n![esquema](https://example.com/a.png)';
  const bytes = new TextEncoder().encode(`---\ntitle: Mi apunte\ntags: [gramática, part4]\n---\n${body}`);
  const english = parseNotebookMarkdownImport('deducción.md', bytes, en);
  const spanish = parseNotebookMarkdownImport('deducción.md', bytes, es);
  if (!english.ok || !spanish.ok) throw new Error('El archivo de prueba debe ser válido en ambos idiomas');
  const { warnings: enWarnings, ...enData } = english.draft;
  const { warnings: esWarnings, ...esData } = spanish.draft;
  expect(enWarnings.map(({ code }) => code)).toEqual(['IMAGES']);
  expect(esWarnings.map(({ code }) => code)).toEqual(['IMAGES']);
  expect(enWarnings[0]?.message).not.toBe(esWarnings[0]?.message);
  expect(esData).toEqual(enData);
  expect(enData).toMatchObject({ title: 'Mi apunte', tags: ['gramática', 'part4'], contentMarkdown: body });

  const db = createDb(':memory:');
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const save = (draft: typeof enData) => createNotebookNote(db, {
      uid: 'e7175998-e0ac-409c-b997-61c998217fa7', folderId: null,
      title: draft.title, tags: [...draft.tags], contentMarkdown: draft.contentMarkdown,
    }, `${today}T12:00:00.000Z`);
    const first = save(enData);
    const retry = save(esData);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.note).toEqual(first.note);
    expect(notebookNoteToMarkdown(retry.note)).toBe(notebookNoteToMarkdown(first.note));
    expect(notebookNoteToMarkdown(first.note).endsWith(body)).toBe(true);
  } finally { db.$client.close(); }
});
