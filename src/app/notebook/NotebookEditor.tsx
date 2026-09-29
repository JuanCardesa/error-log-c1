'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createNotebookNoteSchema, NOTEBOOK_LIMITS, saveNotebookNoteSchema } from '@/lib/notebook/schemas';
import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import type { NotebookFolder, NotebookNote } from '@/lib/notebook/types';
import { notebookNoteHref } from '@/lib/notebook/urls';
import ui from '../_shared/ui.module.css';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { createNoteAction, finishEditingAction, getNoteAction, getNoteByUidAction, saveNoteAction } from './actions';
import { formatNotebookSelection, type Formatting } from './editorFormatting';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadNotebookDraft } from './notebookDraft';
import { matchesNoteSnapshot, reconcileNotebookWrite, type NoteSnapshot, type Reconciliation, type WriteAttempt } from './reconcileSave';
import { useNotebookAutosave } from './useNotebookAutosave';
import { useNotebookDraft } from './useNotebookDraft';
import styles from './editor.module.css';

type Form = { title: string; folderId: number | null; tagsText: string; contentMarkdown: string };
type FieldErrors = Readonly<Record<string, readonly string[]>>;
type SaveIssue =
  | { readonly kind: 'uncertain'; readonly attempt: WriteAttempt; readonly form: Form }
  | { readonly kind: 'uncertainCreate' }
  | { readonly kind: 'conflict'; readonly current: NotebookNote }
  | { readonly kind: 'deleted' };

function formFromNote(note: NotebookNote): Form {
  return { title: note.title, folderId: note.folderId, tagsText: note.tags.join(', '), contentMarkdown: note.contentMarkdown };
}

function formKey(form: Form): string { return JSON.stringify(form); }

export function NotebookEditor({ note, folders, initialFolderId = null, requestedDraftKey }: {
  readonly note?: NotebookNote;
  readonly folders: readonly NotebookFolder[];
  readonly initialFolderId?: number | null;
  readonly requestedDraftKey?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => note === undefined
    ? { title: '', folderId: initialFolderId, tagsText: '', contentMarkdown: '' }
    : formFromNote(note));
  const formRef = useRef(form);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const queuedRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [issue, setIssueState] = useState<SaveIssue | null>(null);
  const issueRef = useRef<SaveIssue | null>(null);
  const [confirmLoadRemote, setConfirmLoadRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(note);
  const savedRef = useRef(note);
  const [savedKey, setSavedKey] = useState<string | null>(note === undefined ? null : formKey(formFromNote(note)));
  const savedFormRef = useRef(form);
  const needsEditorRouteRef = useRef(note === undefined);
  const initialReaderTitleRef = useRef(note?.title);
  const uidRef = useRef<string | null>(note?.uid ?? null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const dirty = savedKey !== formKey(form);
  const pendingChanges = savedNote === undefined
    ? form.title !== '' || form.tagsText !== '' || form.contentMarkdown !== '' || form.folderId !== initialFolderId
    : dirty;
  const readerHref = savedNote === undefined ? '/notebook' : notebookNoteHref(savedNote);
  const firstHeading = activeTab === 'preview' ? analyzeNotebookMarkdown(form.contentMarkdown).headings[0] : undefined;
  const hideFirstH1 = firstHeading?.depth === 1 && firstHeading.text === form.title.trim();
  const draft = useNotebookDraft({
    note: savedNote, form, formRef, uidRef, dirty: pendingChanges || issue !== null, touched, requestedKey: requestedDraftKey,
    onRecover: (fields, stale, createAttempted) => {
      change(fields);
      if (stale && savedRef.current !== undefined) setIssue({ kind: 'conflict', current: savedRef.current });
      else if (createAttempted) {
        setIssue({ kind: 'uncertainCreate' });
        void checkRecoveredCreate();
      }
    },
    onDiscard: () => { setTouched(true); },
  });
  const editorLocked = !draft.ready || draft.candidate !== null;

  function change(patch: Partial<Form>) {
    const updated = { ...formRef.current, ...patch };
    formRef.current = updated;
    setForm(updated);
    setTouched(true);
    setError(null);
    setFieldErrors({});
    if (pendingRef.current) queuedRef.current = true;
  }

  function setIssue(next: SaveIssue | null) {
    issueRef.current = next;
    setIssueState(next);
  }

  function applyFormatting(kind: Formatting) {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const { start, end } = selectionRef.current;
    const result = formatNotebookSelection(formRef.current.contentMarkdown, start, end, kind);
    change({ contentMarkdown: result.value });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      selectionRef.current = { start: result.selectionStart, end: result.selectionEnd };
    });
  }

  function confirmWrite(updated: NotebookNote, snapshot: Form, sent: NoteSnapshot): boolean {
    const previous = savedRef.current;
    if (!matchesNoteSnapshot(updated, sent)
      || (previous !== undefined && (updated.id !== previous.id || updated.revision <= previous.revision))) {
      setIssue({ kind: 'conflict', current: updated });
      return false;
    }
    draft.markConfirmed(updated);
    savedRef.current = updated;
    setSavedNote(updated);
    const canonical = formFromNote(updated);
    savedFormRef.current = canonical;
    setSavedKey(formKey(canonical));
    if (formKey(formRef.current) === formKey(snapshot)) {
      formRef.current = canonical;
      setForm(canonical);
      draft.clearConfirmed(updated);
      if (needsEditorRouteRef.current) {
        needsEditorRouteRef.current = false;
        if (!finishingRef.current) router.replace(`${notebookNoteHref(updated)}/editar`);
      }
    } else {
      queuedRef.current = true;
      draft.flushNow();
    }
    return true;
  }

  function handleReconciliation(result: Reconciliation, attempt: WriteAttempt, snapshot: Form): boolean {
    if (result.kind === 'confirmed') return confirmWrite(result.note, snapshot, attempt.snapshot);
    if (result.kind === 'conflict') setIssue({ kind: 'conflict', current: result.current });
    else if (result.kind === 'deleted') setIssue({ kind: 'deleted' });
    else if (result.kind === 'uncertain') setIssue({ kind: 'uncertain', attempt, form: snapshot });
    return false;
  }

  function reconcile(attempt: WriteAttempt) {
    return reconcileNotebookWrite(attempt, { byId: getNoteAction, byUid: getNoteByUidAction });
  }

  async function checkRecoveredCreate() {
    const uid = uidRef.current;
    if (uid === null) return;
    const snapshot = formRef.current;
    setChecking(true);
    try {
      const result = await getNoteByUidAction({ uid });
      if (!result.ok) return;
      const tags = snapshot.tagsText.trim() === '' ? [] : snapshot.tagsText.split(',').map((tag) => tag.trim());
      const parsed = createNotebookNoteSchema.safeParse({ uid, title: snapshot.title, folderId: snapshot.folderId,
        tags, contentMarkdown: snapshot.contentMarkdown });
      if (parsed.success && matchesNoteSnapshot(result.data, parsed.data)) {
        setIssue(null);
        confirmWrite(result.data, snapshot, parsed.data);
      } else setIssue({ kind: 'conflict', current: result.data });
    } catch { /* Keep the local draft until the user checks again. */ }
    finally { setChecking(false); }
  }

  async function checkUncertain() {
    const currentIssue = issueRef.current;
    if (currentIssue?.kind === 'uncertainCreate') { await checkRecoveredCreate(); return; }
    if (currentIssue?.kind !== 'uncertain') return;
    setChecking(true);
    const result = await reconcile(currentIssue.attempt);
    setChecking(false);
    if (result.kind === 'retry') {
      setIssue(null);
      void save(true);
    } else handleReconciliation(result, currentIssue.attempt, currentIssue.form);
  }

  function loadSavedVersion() {
    const currentIssue = issueRef.current;
    if (currentIssue?.kind !== 'conflict') return;
    const remote = currentIssue.current;
    const canonical = formFromNote(remote);
    savedRef.current = remote;
    savedFormRef.current = canonical;
    setSavedNote(remote);
    setSavedKey(formKey(canonical));
    formRef.current = canonical;
    setForm(canonical);
    draft.markConfirmed(remote);
    draft.clearConfirmed(remote);
    setIssue(null);
    setError(null);
    setConfirmLoadRemote(false);
    if (needsEditorRouteRef.current) {
      needsEditorRouteRef.current = false;
      router.replace(`${notebookNoteHref(remote)}/editar`);
    }
  }

  function keepAsNew() {
    draft.flushNow();
    uidRef.current = crypto.randomUUID();
    savedRef.current = undefined;
    setSavedNote(undefined);
    savedFormRef.current = { title: '', folderId: initialFolderId, tagsText: '', contentMarkdown: '' };
    setSavedKey(null);
    needsEditorRouteRef.current = true;
    queuedRef.current = false;
    draft.resetForNew();
    setIssue(null);
    setError(null);
    setTouched(true);
  }

  function save(manual = false): Promise<boolean> {
    if (pendingRef.current) {
      queuedRef.current = true;
      return savePromiseRef.current ?? Promise.resolve(false);
    }
    const task = performSave(manual);
    savePromiseRef.current = task;
    return task;
  }

  async function performSave(manual: boolean): Promise<boolean> {
    if (editorLocked || issueRef.current !== null) return false;
    const snapshot = formRef.current;
    if (formKey(snapshot) === formKey(savedFormRef.current)) return savedRef.current !== undefined;
    if (savedRef.current === undefined && snapshot.title === '' && snapshot.tagsText === ''
      && snapshot.contentMarkdown === '' && snapshot.folderId === initialFolderId) return false;
    const tags = snapshot.tagsText.trim() === '' ? [] : snapshot.tagsText.split(',').map((tag) => tag.trim());
    const uid = uidRef.current ?? crypto.randomUUID();
    uidRef.current = uid;
    const fields = { uid, title: snapshot.title, folderId: snapshot.folderId, tags, contentMarkdown: snapshot.contentMarkdown };
    const current = savedRef.current;
    const parsed = current === undefined
      ? createNotebookNoteSchema.safeParse(fields)
      : saveNotebookNoteSchema.safeParse({ ...fields, id: current.id, expectedRevision: current.revision });
    if (!parsed.success) {
      if (manual) {
        const errors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          (errors[key] ??= []).push(issue.message);
        }
        setFieldErrors(errors);
        setError('Revisa los campos indicados.');
      }
      return false;
    }

    const sent: NoteSnapshot = { uid: parsed.data.uid, title: parsed.data.title,
      folderId: parsed.data.folderId, tags: parsed.data.tags, contentMarkdown: parsed.data.contentMarkdown };
    const attempt: WriteAttempt = current === undefined
      ? { kind: 'create', snapshot: sent } : { kind: 'save', snapshot: sent, base: current };
    if (attempt.kind === 'create') draft.markCreateAttempted();
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      let result;
      try {
        result = current === undefined
          ? await createNoteAction(parsed.data)
          : await saveNoteAction(parsed.data);
      } catch {
        const reconciled = await reconcile(attempt);
        if (reconciled.kind === 'retry' && attempt.kind === 'save') {
          try { result = await saveNoteAction(parsed.data); }
          catch {
            const checked = await reconcile(attempt);
            return handleReconciliation(checked.kind === 'retry' ? { kind: 'uncertain' } : checked, attempt, snapshot);
          }
        } else {
          return handleReconciliation(reconciled, attempt, snapshot);
        }
      }
      if (!result.ok) {
        queuedRef.current = false;
        if (result.code === 'CONFLICT' && result.current !== undefined) {
          if (matchesNoteSnapshot(result.current, sent)
            && (attempt.kind === 'create' || result.current.revision > attempt.base.revision)) {
            return confirmWrite(result.current, snapshot, sent);
          } else setIssue({ kind: 'conflict', current: result.current });
        } else if (result.code === 'NOT_FOUND') setIssue({ kind: 'deleted' });
        else setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return false;
      }
      const updated = 'note' in result.data ? result.data.note : result.data;
      return confirmWrite(updated, snapshot, sent);
    } catch {
      setIssue({ kind: 'uncertain', attempt, form: snapshot });
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
      if (queuedRef.current && issueRef.current === null) {
        queuedRef.current = false;
        if (formKey(formRef.current) !== formKey(savedFormRef.current)) queueMicrotask(() => { void save(false); });
      }
    }
  }

  async function finishEditing() {
    if (finishingRef.current || editorLocked || issueRef.current !== null) return;
    finishingRef.current = true;
    setFinishing(true);
    draft.flushNow();
    let navigating = false;
    try {
      while (pendingRef.current) {
        const active = savePromiseRef.current;
        if (active === null || !await active) return;
      }
      while (formKey(formRef.current) !== formKey(savedFormRef.current)) {
        if (!await save(true)) return;
        if (issueRef.current !== null) return;
        while (pendingRef.current) {
          const active = savePromiseRef.current;
          if (active === null || !await active) return;
        }
      }
      const confirmed = savedRef.current;
      if (confirmed === undefined) {
        navigating = true;
        router.push('/notebook');
        return;
      }
      const result = await finishEditingAction({
        id: confirmed.id, uid: confirmed.uid, expectedRevision: confirmed.revision,
        previousTitle: initialReaderTitleRef.current,
      });
      if (!result.ok) {
        if (result.code === 'CONFLICT' && result.current !== undefined) {
          draft.preserveCurrent();
          setIssue({ kind: 'conflict', current: result.current });
        } else if (result.code === 'NOT_FOUND') {
          draft.preserveCurrent();
          setIssue({ kind: 'deleted' });
        } else setError(result.message);
        return;
      }
      navigating = true;
      router.push(notebookNoteHref(result.data));
    } catch {
      setError('No se pudo terminar la edición. Vuelve a intentarlo.');
    } finally {
      if (!navigating) {
        finishingRef.current = false;
        setFinishing(false);
      }
    }
  }

  useNotebookAutosave(formKey(form), draft.ready && draft.candidate === null && touched
    && pendingChanges && issue === null && error === null && !finishing, () => { void save(false); });

  useEffect(() => {
    if (!pendingChanges) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [pendingChanges]);

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save(true);
    }
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tab: 'edit' | 'preview') {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft'
      ? tab === 'edit' ? 'preview' : 'edit'
      : event.key === 'Home' ? 'edit' : event.key === 'End' ? 'preview' : null;
    if (next === null) return;
    event.preventDefault();
    setActiveTab(next);
    document.getElementById(`notebook-tab-${next}`)?.focus();
  }

  function fieldError(name: string) {
    const messages = fieldErrors[name];
    return messages === undefined ? null : <p className={ui.fieldError} role="alert">{messages.join(' ')}</p>;
  }

  return (
    <div className={styles.editor} onKeyDownCapture={onEditorKeyDown}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Notebook</p>
          <h1>{savedNote === undefined ? 'Nuevo apunte' : 'Editar apunte'}</h1>
        </div>
        <Link href={readerHref} className={ui.backLink} onClick={(event) => {
          if (finishingRef.current) { event.preventDefault(); return; }
          if (pendingChanges || issueRef.current !== null) {
            if (!window.confirm('Hay cambios sin confirmar. ¿Salir de todos modos?')) event.preventDefault();
            else draft.flushNow();
          } else if (savedRef.current !== undefined && !editorLocked) {
            event.preventDefault();
            void finishEditing();
          }
        }}>
          {savedNote === undefined ? 'Volver a Notebook' : 'Volver a lectura'}
        </Link>
      </div>

      {draft.candidate !== null && (
        <section className={styles.draftNotice} aria-label="Borrador recuperable">
          <h2>Hay un borrador local de este apunte</h2>
          <p>Guardado {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.candidate.savedAt))}.
            {draft.fromOtherTab ? ' Proviene de otra pestaña; al recuperarlo se conservará allí una copia.' : ''}
            {draft.hasAnotherRequested ? ' Esta pestaña tiene otro borrador pendiente; decide sobre él antes de abrir el seleccionado.' : ''}
          </p>
          <div className={styles.draftActions}>
            <button type="button" className={ui.primary} onClick={draft.recover}>Recuperar borrador</button>
            <button type="button" className={ui.secondary} onClick={() => {
              if (draft.candidate !== null) downloadNotebookDraft(draft.candidate);
            }}>Descargar borrador</button>
            <button type="button" className={ui.dangerLink} onClick={() => { setDiscardError(null); setConfirmDiscard(true); }}>Descartar borrador…</button>
          </div>
        </section>
      )}
      {issue !== null && <div role="alert" className={styles.draftNotice}>
        <p>{issue.kind === 'conflict'
          ? 'El apunte guardado cambió en otra pestaña. Tus cambios siguen aquí; el guardado está detenido.'
          : issue.kind === 'deleted'
            ? 'Este apunte fue borrado. Tus cambios siguen aquí; el guardado está detenido.'
            : issue.kind === 'uncertainCreate'
              ? 'No se pudo confirmar si este borrador ya se creó. Comprueba su estado antes de guardarlo.'
              : 'No se pudo confirmar el último guardado. Tus cambios siguen aquí; comprueba su estado.'}</p>
        <div className={styles.draftActions}>
          {(issue.kind === 'uncertain' || issue.kind === 'uncertainCreate') &&
            <button type="button" className={ui.secondary} disabled={checking} onClick={() => { void checkUncertain(); }}>
              {checking ? 'Comprobando…' : 'Comprobar estado'}
            </button>}
          {issue.kind === 'conflict' &&
            <button type="button" className={ui.secondary} onClick={() => { setConfirmLoadRemote(true); }}>
              Cargar versión guardada…
            </button>}
          <button type="button" className={ui.secondary} onClick={keepAsNew}>Conservar como nuevo apunte</button>
          <button type="button" className={ui.secondary} onClick={draft.downloadCurrent}>Descargar borrador</button>
        </div>
      </div>}
      {draft.storageProblem !== null && <div role="alert" className={styles.storageWarning}>
        {draft.storageProblem === 'quota'
          ? 'Se agotó el espacio para borradores locales. Tu texto sigue en esta pestaña.'
          : 'No se pudo guardar una copia local. Tu texto sigue en esta pestaña.'}
        <button type="button" className={ui.secondary} onClick={draft.downloadCurrent}>Descargar borrador</button>
      </div>}

      <div className={styles.metaFields}>
        <label className={ui.field}>Título
          <input className={ui.input} value={form.title} maxLength={NOTEBOOK_LIMITS.title} required
            disabled={editorLocked || finishing}
            aria-invalid={fieldErrors['title'] !== undefined}
            onChange={(event) => { change({ title: event.target.value }); }} />
          {fieldError('title')}
        </label>
        <label className={ui.field}>Carpeta
          <select className={ui.select} value={form.folderId ?? ''} disabled={editorLocked || finishing}
            onChange={(event) => { change({ folderId: event.target.value === '' ? null : Number(event.target.value) }); }}>
            <option value="">Sin carpeta</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>
              {folder.parentId === null ? folder.name : `${folders.find((parent) => parent.id === folder.parentId)?.name ?? ''} / ${folder.name}`}
            </option>)}
          </select>
          {fieldError('folderId')}
        </label>
        <label className={ui.field}>Etiquetas <span className={ui.optional}>separadas por comas</span>
          <input className={ui.input} value={form.tagsText} placeholder="gramática, part4" disabled={editorLocked || finishing}
            aria-invalid={fieldErrors['tags'] !== undefined}
            onChange={(event) => { change({ tagsText: event.target.value }); }} />
          {fieldError('tags')}
        </label>
      </div>

      <div className={styles.editorHeader}>
        <div role="tablist" aria-label="Vista del apunte" className={ui.tabs}>
          <button id="notebook-tab-edit" role="tab" type="button" className={`${ui.tab} ${styles.tabButton}`}
            aria-selected={activeTab === 'edit'} aria-controls="notebook-panel-edit" tabIndex={activeTab === 'edit' ? 0 : -1}
            onKeyDown={(event) => { onTabKeyDown(event, 'edit'); }} onClick={() => { setActiveTab('edit'); }}>Editar</button>
          <button id="notebook-tab-preview" role="tab" type="button" className={`${ui.tab} ${styles.tabButton}`}
            aria-selected={activeTab === 'preview'} aria-controls="notebook-panel-preview" tabIndex={activeTab === 'preview' ? 0 : -1}
            onKeyDown={(event) => { onTabKeyDown(event, 'preview'); }} onClick={() => { setActiveTab('preview'); }}>Vista previa</button>
        </div>
        <span aria-live="polite" className={styles.saveStatus}>
          {finishing ? 'Finalizando…' : pending ? 'Guardando…' : issue !== null || error !== null ? 'No guardado' : pendingChanges ? 'Sin guardar' : savedNote === undefined ? 'Nuevo apunte' : 'Guardado'}
        </span>
      </div>

      <div id="notebook-panel-edit" role="tabpanel" aria-labelledby="notebook-tab-edit" hidden={activeTab !== 'edit'}>
        <div role="toolbar" aria-label="Formato Markdown" className={styles.toolbar}>
          {([
            ['heading', 'Encabezado', 'H2'], ['bold', 'Negrita', 'B'], ['italic', 'Cursiva', 'I'],
            ['list', 'Lista', 'Lista'], ['quote', 'Cita', 'Cita'], ['link', 'Enlace', 'Enlace'],
          ] as const).map(([kind, label, text]) => (
            <button key={kind} type="button" className={`${ui.secondary} ${ui.compact}`} aria-label={label}
              disabled={editorLocked || finishing}
              onMouseDown={(event) => { event.preventDefault(); }}
              onClick={() => { applyFormatting(kind); }}>{text}</button>
          ))}
        </div>
        <label className={`${ui.field} ${styles.bodyLabel}`} htmlFor="notebook-body">Contenido Markdown</label>
        <textarea id="notebook-body" ref={textareaRef} className={`${ui.textarea} ${styles.textarea}`}
          value={form.contentMarkdown} disabled={editorLocked || finishing}
          aria-invalid={fieldErrors['contentMarkdown'] !== undefined}
          onChange={(event) => { change({ contentMarkdown: event.target.value }); }}
          onSelect={(event) => { selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }} />
        {fieldError('contentMarkdown')}
        <p className={ui.help}>Markdown original · máximo 256 KiB · Ctrl/⌘+S para guardar.</p>
      </div>

      <div id="notebook-panel-preview" role="tabpanel" aria-labelledby="notebook-tab-preview" hidden={activeTab !== 'preview'}>
        <article className={styles.preview}>
          <h1 id={hideFirstH1 ? firstHeading?.slug : undefined} className={styles.previewTitle}>{form.title.trim() || 'Sin título'}</h1>
          {form.contentMarkdown === '' ? <p className={ui.help}>Todavía no hay contenido para mostrar.</p> : (
            <MarkdownRenderer markdown={form.contentMarkdown} basePath={savedNote === undefined ? '/notebook/' : readerHref} hideFirstH1={hideFirstH1} />
          )}
        </article>
      </div>

      <div className={styles.actions}>
        <button type="button" className={ui.primary} disabled={editorLocked || finishing || issue !== null || !pendingChanges} onClick={() => { void save(true); }}>Guardar ahora</button>
        <button type="button" className={ui.secondary} disabled={editorLocked || finishing || issue !== null}
          onClick={() => { void finishEditing(); }}>Terminar edición</button>
        {error !== null && <p role="alert" className={ui.fieldError}>{error}</p>}
      </div>
      <ConfirmDialog open={confirmDiscard} title="Descartar borrador local" confirmLabel="Descartar borrador"
        error={discardError}
        onConfirm={() => {
          if (draft.discard()) setConfirmDiscard(false);
          else setDiscardError('No se pudo borrar la copia local. Inténtalo de nuevo.');
        }} onCancel={() => { setConfirmDiscard(false); setDiscardError(null); }}>
        Se borrará la copia local seleccionada. Esta acción no se puede deshacer.
      </ConfirmDialog>
      <ConfirmDialog open={confirmLoadRemote} title="Cargar versión guardada" confirmLabel="Cargar versión guardada"
        onConfirm={loadSavedVersion} onCancel={() => { setConfirmLoadRemote(false); }}>
        Se sustituirá el texto de este editor por la versión guardada. Descarga primero el borrador si quieres conservar una copia.
      </ConfirmDialog>
    </div>
  );
}
