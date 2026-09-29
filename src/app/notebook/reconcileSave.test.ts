import { describe, expect, it } from 'vitest';

import type { NotebookNote, NotebookResult } from '@/lib/notebook/types';
import { reconcileNotebookWrite, type WriteAttempt } from './reconcileSave';

const base: NotebookNote = {
  id: 42, uid: '9c8de1e3-03e6-42ec-a098-ac0db92331d0', revision: 1,
  title: 'Original', folderId: null, tags: [], contentMarkdown: 'Old',
  createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
};
const snapshot = { uid: base.uid, title: 'Updated', folderId: null, tags: ['part4'], contentMarkdown: 'New' };
const save: WriteAttempt = { kind: 'save', base, snapshot };
const create: WriteAttempt = { kind: 'create', snapshot };

function readers(result: NotebookResult<NotebookNote>) {
  return { byId: async () => result, byUid: async () => result };
}

describe('reconciliación de Notebook', () => {
  it('confirma una respuesta perdida solo tras leer el snapshot escrito', async () => {
    const current = { ...base, ...snapshot, revision: 2 };
    expect(await reconcileNotebookWrite(save, readers({ ok: true, data: current })))
      .toEqual({ kind: 'confirmed', note: current });
    expect(await reconcileNotebookWrite(create, readers({ ok: true, data: current })))
      .toEqual({ kind: 'confirmed', note: current });
  });

  it('reintenta solo cuando sigue intacta la revisión de origen', async () => {
    expect(await reconcileNotebookWrite(save, readers({ ok: true, data: base }))).toEqual({ kind: 'retry' });
    expect(await reconcileNotebookWrite(save, readers({ ok: true, data: { ...base, revision: 2 } })))
      .toMatchObject({ kind: 'conflict' });
  });

  it('distingue conflicto, borrado e incertidumbre de una creación', async () => {
    expect(await reconcileNotebookWrite(save, readers({ ok: true, data: { ...base, title: 'Otra pestaña', revision: 2 } })))
      .toMatchObject({ kind: 'conflict' });
    const missing = { ok: false, code: 'NOT_FOUND', message: 'Falta' } as const;
    expect(await reconcileNotebookWrite(save, readers(missing))).toEqual({ kind: 'deleted' });
    expect(await reconcileNotebookWrite(create, readers(missing))).toEqual({ kind: 'uncertain' });
    expect(await reconcileNotebookWrite(save, {
      byId: async () => { throw new Error('red'); }, byUid: async () => { throw new Error('red'); },
    })).toEqual({ kind: 'uncertain' });
  });
});
