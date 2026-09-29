import { describe, expect, it } from 'vitest';

import {
  deleteNotebookDraft, ensureNotebookTabId, listNotebookDrafts, notebookDraftKey,
  parseNotebookDraft, writeNotebookDraft, type NotebookDraft,
} from './notebookDraft';

function storage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

const draft: NotebookDraft = {
  v: 1,
  uid: '9c8de1e3-03e6-42ec-a098-ac0db92331d0',
  tabId: 'ef77ea2a-f739-43b0-b532-af6d60f5d53c',
  noteId: null,
  baseRevision: null,
  title: 'Sin guardar', folderId: null, tagsText: 'part4', contentMarkdown: '## Regla\n\nTexto.',
  savedAt: '2026-09-29T10:00:00.000Z',
};

describe('borradores locales Notebook', () => {
  it('separa pestañas y conserva UID, revisión y contenido exacto', () => {
    const local = storage();
    const other = { ...draft, tabId: '123597dd-58b7-4f7f-b0a7-0ef473568245', contentMarkdown: 'Otro texto' };
    expect(writeNotebookDraft(local, draft)).toBe('saved');
    expect(writeNotebookDraft(local, other)).toBe('saved');
    expect(notebookDraftKey(draft)).not.toBe(notebookDraftKey(other));
    expect(listNotebookDrafts(local)).toEqual([other, draft]);
    expect(deleteNotebookDraft(local, notebookDraftKey(draft))).toBe(true);
    expect(listNotebookDrafts(local)).toEqual([other]);
  });

  it('ignora formato, revisión y clave inválidos sin romper la lectura', () => {
    const local = storage();
    local.setItem(notebookDraftKey(draft), '{mal json');
    expect(listNotebookDrafts(local)).toEqual([]);
    local.setItem(notebookDraftKey(draft), JSON.stringify({ ...draft, v: 2 }));
    expect(listNotebookDrafts(local)).toEqual([]);
    local.setItem(notebookDraftKey(draft), JSON.stringify({ ...draft, baseRevision: 2 }));
    expect(listNotebookDrafts(local)).toEqual([]);
    expect(parseNotebookDraft(JSON.stringify(draft), `${notebookDraftKey(draft)}-ajeno`)).toBeNull();
  });

  it('avisa cuando se agota la cuota o no está disponible el almacenamiento', () => {
    expect(writeNotebookDraft({ setItem() { throw new DOMException('full', 'QuotaExceededError'); } }, draft)).toBe('quota');
    expect(writeNotebookDraft({ setItem() { throw new Error('blocked'); } }, draft)).toBe('unavailable');
    expect(draft.contentMarkdown).toBe('## Regla\n\nTexto.');
  });

  it('mantiene la identidad de la pestaña en recargas y distingue otra ventana', () => {
    const first = { name: '' };
    const second = { name: '' };
    const id = ensureNotebookTabId(first);
    expect(ensureNotebookTabId(first)).toBe(id);
    expect(ensureNotebookTabId(second)).not.toBe(id);
  });
});
