import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, type Db } from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { createNotebookNote } from '@/lib/db/notebookRepo';
import { notebookNoteHref } from '@/lib/notebook/urls';
import { setNoteFavoriteAction } from './actions';

let testDb: Db;
vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getDb: () => testDb };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  testDb = createDb(':memory:');
  migrate(testDb);
  vi.clearAllMocks();
});
afterEach(() => testDb.$client.close());

describe('acción de favoritos', () => {
  it('valida la entrada y devuelve NOT_FOUND para un apunte ausente', async () => {
    expect(await setNoteFavoriteAction({ id: 0, favorite: 'sí' })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setNoteFavoriteAction({ id: 1, favorite: true, revision: 1 })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setNoteFavoriteAction({ id: 999, favorite: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('confirma la marca y revalida la portada y el lector', async () => {
    const note = createNotebookNote(testDb, {
      uid: randomUUID(), title: 'Apunte favorito', folderId: null, tags: [], contentMarkdown: '',
    }, '2026-09-29T07:00:00.000Z').note;
    const result = await setNoteFavoriteAction({ id: note.id, favorite: true });
    expect(result).toMatchObject({ ok: true, data: { id: note.id, revision: 1, updatedAt: note.updatedAt } });
    if (result.ok) expect(result.data.favoritedAt).not.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith('/notebook');
    expect(revalidatePath).toHaveBeenCalledWith(notebookNoteHref(note));
  });
});
