import { z } from 'zod';

export const NOTEBOOK_DRAFT_PREFIX = 'errorlog:notebook:draft:';
export const NOTEBOOK_DRAFT_EVENT = 'errorlog:notebook:drafts';
const TAB_PREFIX = 'errorlog:notebook:tab:';
const MAX_RAW_LENGTH = 8 * 1024 * 1024;

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const draftSchema = z.strictObject({
  v: z.literal(1),
  uid: z.uuid(),
  tabId: z.uuid(),
  noteId: id.nullable(),
  baseRevision: id.nullable(),
  title: z.string().max(1000),
  folderId: id.nullable(),
  tagsText: z.string().max(10_000),
  contentMarkdown: z.string().max(4 * 1024 * 1024),
  createAttempted: z.boolean().optional(),
  savedAt: z.iso.datetime(),
}).refine((draft) => (draft.noteId === null) === (draft.baseRevision === null));

export type NotebookDraft = z.output<typeof draftSchema>;
export type NotebookDraftFields = Pick<NotebookDraft, 'title' | 'folderId' | 'tagsText' | 'contentMarkdown'>;
export type DraftWriteResult = 'saved' | 'quota' | 'unavailable';

export function notebookDraftKey(draft: Pick<NotebookDraft, 'uid' | 'tabId' | 'noteId'>): string {
  return `${NOTEBOOK_DRAFT_PREFIX}${draft.noteId === null ? `new:${draft.uid}` : `note:${draft.uid}`}:${draft.tabId}`;
}

export function legacyNewDraftKey(draft: Pick<NotebookDraft, 'tabId' | 'noteId'>): string | null {
  return draft.noteId === null ? `${NOTEBOOK_DRAFT_PREFIX}new:${draft.tabId}` : null;
}

export function parseNotebookDraft(raw: string | null, key: string): NotebookDraft | null {
  if (raw === null || raw.length > MAX_RAW_LENGTH) return null;
  try {
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success && (notebookDraftKey(result.data) === key || legacyNewDraftKey(result.data) === key)
      ? result.data : null;
  } catch { return null; }
}

export function listNotebookDrafts(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): NotebookDraft[] {
  const drafts: NotebookDraft[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null || !key.startsWith(NOTEBOOK_DRAFT_PREFIX)) continue;
      const draft = parseNotebookDraft(storage.getItem(key), key);
      if (draft !== null) drafts.push(draft);
    }
  } catch { return drafts; }
  return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || notebookDraftKey(a).localeCompare(notebookDraftKey(b)));
}

export function writeNotebookDraft(storage: Pick<Storage, 'setItem'>, draft: NotebookDraft): DraftWriteResult {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return 'unavailable';
  try {
    storage.setItem(notebookDraftKey(parsed.data), JSON.stringify(parsed.data));
    return 'saved';
  } catch (error) {
    return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ? 'quota' : 'unavailable';
  }
}

export function deleteNotebookDraft(storage: Pick<Storage, 'removeItem' | 'getItem'>, key: string): boolean {
  if (!key.startsWith(NOTEBOOK_DRAFT_PREFIX)) return false;
  try {
    const draft = parseNotebookDraft(storage.getItem(key), key);
    storage.removeItem(key);
    const newKey = /^new:([0-9a-f-]+):([0-9a-f-]+)$/u.exec(key.slice(NOTEBOOK_DRAFT_PREFIX.length));
    const legacy = draft === null && newKey !== null
      ? `${NOTEBOOK_DRAFT_PREFIX}new:${newKey[2]}`
      : draft === null ? null : legacyNewDraftKey(draft);
    const uid = draft?.uid ?? newKey?.[1];
    if (legacy !== null && legacy !== key && parseNotebookDraft(storage.getItem(legacy), legacy)?.uid === uid) {
      storage.removeItem(legacy);
    }
    return true;
  } catch { return false; }
}

export function readNotebookTabId(name: string): string | null {
  if (!name.startsWith(TAB_PREFIX)) return null;
  const result = z.uuid().safeParse(name.slice(TAB_PREFIX.length));
  return result.success ? result.data : null;
}

export function ensureNotebookTabId(win: Pick<Window, 'name'>): string {
  const existing = readNotebookTabId(win.name);
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  win.name = `${TAB_PREFIX}${created}`;
  return created;
}

export function downloadNotebookDraft(draft: NotebookDraft): void {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `borrador-notebook-${draft.uid}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 0);
}
