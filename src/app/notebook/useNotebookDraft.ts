'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

import type { NotebookNote } from '@/lib/notebook/types';
import {
  NOTEBOOK_DRAFT_EVENT, NOTEBOOK_DRAFT_PREFIX, deleteNotebookDraft, downloadNotebookDraft,
  ensureNotebookTabId, listNotebookDrafts, notebookDraftKey, readNotebookTabId,
  writeNotebookDraft, type NotebookDraft, type NotebookDraftFields,
} from './notebookDraft';

const TAB_EVENT = 'errorlog:notebook:tabready';

function notifyDrafts() { window.dispatchEvent(new Event(NOTEBOOK_DRAFT_EVENT)); }

function subscribeDrafts(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(NOTEBOOK_DRAFT_PREFIX)) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(NOTEBOOK_DRAFT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(NOTEBOOK_DRAFT_EVENT, onChange);
  };
}

function readDrafts(): string {
  try { return JSON.stringify(listNotebookDrafts(window.localStorage)); }
  catch { return '[]'; }
}

export function useNotebookDrafts(): readonly NotebookDraft[] {
  const raw = useSyncExternalStore(subscribeDrafts, readDrafts, () => '[]');
  return useMemo(() => JSON.parse(raw) as NotebookDraft[], [raw]);
}

function subscribeTab(onChange: () => void) {
  window.addEventListener(TAB_EVENT, onChange);
  return () => { window.removeEventListener(TAB_EVENT, onChange); };
}

function readTab() { return readNotebookTabId(window.name); }

function useNotebookTabId(): string | null {
  const tabId = useSyncExternalStore(subscribeTab, readTab, () => null);
  useEffect(() => {
    ensureNotebookTabId(window);
    window.dispatchEvent(new Event(TAB_EVENT));
  }, []);
  return tabId;
}

export function useNotebookDraft({ note, form, formRef, uidRef, dirty, touched, requestedKey, onRecover, onDiscard }: {
  readonly note?: NotebookNote;
  readonly form: NotebookDraftFields;
  readonly formRef: RefObject<NotebookDraftFields>;
  readonly uidRef: RefObject<string | null>;
  readonly dirty: boolean;
  readonly touched: boolean;
  readonly requestedKey?: string;
  readonly onRecover: (fields: NotebookDraftFields, stale: boolean) => void;
  readonly onDiscard: () => void;
}) {
  const tabId = useNotebookTabId();
  const drafts = useNotebookDrafts();
  const [storageProblem, setStorageProblem] = useState<'quota' | 'unavailable' | null>(null);
  const clearedFormRef = useRef<string | null>(null);
  const recoveredBaseRevisionRef = useRef<number | null | undefined>(undefined);
  const ownKey = tabId === null ? null : note === undefined
    ? `${NOTEBOOK_DRAFT_PREFIX}new:${tabId}`
    : notebookDraftKey({ uid: note.uid, tabId, noteId: note.id });
  const matching = (draft: NotebookDraft) => note === undefined
    ? draft.noteId === null
    : draft.noteId === note.id && draft.uid === note.uid;
  const requested = requestedKey === undefined ? undefined : drafts.find((draft) => notebookDraftKey(draft) === requestedKey && matching(draft));
  const own = ownKey === null ? undefined : drafts.find((draft) => notebookDraftKey(draft) === ownKey && matching(draft));
  // La copia de esta pestaña se decide primero para no sobrescribirla al abrir otra desde la portada.
  const candidate = touched ? null : own ?? requested ?? null;

  const makeDraft = useCallback((): NotebookDraft | null => {
    if (tabId === null) return null;
    const uid = note?.uid ?? uidRef.current ?? crypto.randomUUID();
    uidRef.current = uid;
    return {
      v: 1, uid, tabId, noteId: note?.id ?? null,
      baseRevision: recoveredBaseRevisionRef.current === undefined ? note?.revision ?? null : recoveredBaseRevisionRef.current,
      ...formRef.current, savedAt: new Date().toISOString(),
    };
  }, [tabId, note, uidRef, formRef]);

  const flush = useCallback(() => {
    if (!dirty || !touched || candidate !== null) return;
    const current = formRef.current;
    if (JSON.stringify(current) === clearedFormRef.current) return;
    const draft = makeDraft();
    if (draft === null) return;
    let result: 'saved' | 'quota' | 'unavailable';
    try { result = writeNotebookDraft(window.localStorage, draft); }
    catch { result = 'unavailable'; }
    setStorageProblem(result === 'saved' ? null : result);
    if (result === 'saved') notifyDrafts();
  }, [dirty, touched, candidate, formRef, makeDraft]);

  useEffect(() => {
    if (tabId === null || !touched) return;
    if (!dirty) {
      if (ownKey !== null && deleteNotebookDraft(window.localStorage, ownKey)) notifyDrafts();
      return;
    }
    const timer = window.setTimeout(flush, 250);
    return () => { window.clearTimeout(timer); };
  }, [form, dirty, touched, tabId, ownKey, flush]);

  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    const onLeave = () => { flushRef.current(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      flushRef.current();
    };
  }, []);

  function recover() {
    if (candidate === null || tabId === null) return;
    uidRef.current = candidate.noteId === null && candidate.tabId !== tabId ? crypto.randomUUID() : candidate.uid;
    recoveredBaseRevisionRef.current = candidate.baseRevision;
    const stale = note !== undefined && candidate.baseRevision !== note.revision;
    onRecover({ title: candidate.title, folderId: candidate.folderId, tagsText: candidate.tagsText, contentMarkdown: candidate.contentMarkdown }, stale);
  }

  function discard(): boolean {
    if (candidate === null) return false;
    if (!deleteNotebookDraft(window.localStorage, notebookDraftKey(candidate))) return false;
    notifyDrafts();
    if (candidate !== own || requested === undefined || requested === own) onDiscard();
    return true;
  }

  function clearOwn() {
    clearedFormRef.current = JSON.stringify(formRef.current);
    if (ownKey !== null && deleteNotebookDraft(window.localStorage, ownKey)) notifyDrafts();
  }

  function markConfirmed() { recoveredBaseRevisionRef.current = undefined; }

  function resetToSaved() {
    recoveredBaseRevisionRef.current = undefined;
    clearOwn();
  }

  function downloadCurrent() {
    const draft = makeDraft();
    if (draft !== null) downloadNotebookDraft(draft);
  }

  return { ready: tabId !== null, candidate, fromOtherTab: candidate !== null && candidate.tabId !== tabId,
    hasAnotherRequested: candidate === own && requested !== undefined && requested !== own,
    storageProblem, recover, discard, clearOwn, markConfirmed, resetToSaved, downloadCurrent };
}

export function discardNotebookDraft(draft: NotebookDraft) {
  const removed = deleteNotebookDraft(window.localStorage, notebookDraftKey(draft));
  if (removed) notifyDrafts();
  return removed;
}
