import type { NotebookNote, NotebookResult } from '@/lib/notebook/types';

export interface NoteSnapshot {
  readonly uid: string;
  readonly title: string;
  readonly folderId: number | null;
  readonly tags: readonly string[];
  readonly contentMarkdown: string;
}

export type WriteAttempt =
  | { readonly kind: 'create'; readonly snapshot: NoteSnapshot }
  | { readonly kind: 'save'; readonly snapshot: NoteSnapshot; readonly base: NotebookNote };

export type Reconciliation =
  | { readonly kind: 'confirmed'; readonly note: NotebookNote }
  | { readonly kind: 'retry' }
  | { readonly kind: 'conflict'; readonly current: NotebookNote }
  | { readonly kind: 'deleted' }
  | { readonly kind: 'uncertain' };

export function matchesNoteSnapshot(note: NotebookNote, snapshot: NoteSnapshot): boolean {
  return note.uid === snapshot.uid && note.title === snapshot.title
    && note.folderId === snapshot.folderId && note.contentMarkdown === snapshot.contentMarkdown
    && note.tags.length === snapshot.tags.length
    && note.tags.every((tag, index) => tag === snapshot.tags[index]);
}

/** Read after an uncertain response before deciding whether a CAS write may be retried. */
export async function reconcileNotebookWrite(
  attempt: WriteAttempt,
  readers: {
    readonly byId: (input: { readonly id: number; readonly uid: string }) => Promise<NotebookResult<NotebookNote>>;
    readonly byUid: (input: { readonly uid: string }) => Promise<NotebookResult<NotebookNote>>;
  },
): Promise<Reconciliation> {
  try {
    const result = attempt.kind === 'create'
      ? await readers.byUid({ uid: attempt.snapshot.uid })
      : await readers.byId({ id: attempt.base.id, uid: attempt.snapshot.uid });
    if (!result.ok) {
      if (result.code !== 'NOT_FOUND') return { kind: 'uncertain' };
      return attempt.kind === 'create' ? { kind: 'uncertain' } : { kind: 'deleted' };
    }
    const current = result.data;
    if (matchesNoteSnapshot(current, attempt.snapshot)
      && (attempt.kind === 'create' || current.revision > attempt.base.revision)) {
      return { kind: 'confirmed', note: current };
    }
    if (attempt.kind === 'save' && current.revision === attempt.base.revision
      && matchesNoteSnapshot(current, attempt.base)) return { kind: 'retry' };
    return { kind: 'conflict', current };
  } catch {
    return { kind: 'uncertain' };
  }
}
