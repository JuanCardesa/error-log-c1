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
import { createNoteAction, saveNoteAction } from './actions';
import { formatNotebookSelection, type Formatting } from './editorFormatting';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadNotebookDraft } from './notebookDraft';
import { useNotebookDraft } from './useNotebookDraft';
import styles from './editor.module.css';

type Form = { title: string; folderId: number | null; tagsText: string; contentMarkdown: string };
type FieldErrors = Readonly<Record<string, readonly string[]>>;

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
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState(false);
  const [recoveryConflict, setRecoveryConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(note);
  const savedRef = useRef(note);
  const [savedKey, setSavedKey] = useState<string | null>(note === undefined ? null : formKey(formFromNote(note)));
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
    note: savedNote, form, formRef, uidRef, dirty: pendingChanges, touched, requestedKey: requestedDraftKey,
    onRecover: (fields, stale) => {
      change(fields);
      setRecoveryConflict(stale);
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

  async function save() {
    if (pendingRef.current || editorLocked || recoveryConflict || !pendingChanges) return;
    const snapshot = formRef.current;
    const tags = snapshot.tagsText.trim() === '' ? [] : snapshot.tagsText.split(',').map((tag) => tag.trim());
    const uid = uidRef.current ?? crypto.randomUUID();
    uidRef.current = uid;
    const fields = { uid, title: snapshot.title, folderId: snapshot.folderId, tags, contentMarkdown: snapshot.contentMarkdown };
    const current = savedRef.current;
    const parsed = current === undefined
      ? createNotebookNoteSchema.safeParse(fields)
      : saveNotebookNoteSchema.safeParse({ ...fields, id: current.id, expectedRevision: current.revision });
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        (errors[key] ??= []).push(issue.message);
      }
      setFieldErrors(errors);
      setError('Revisa los campos indicados.');
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = current === undefined
        ? await createNoteAction(parsed.data)
        : await saveNoteAction(parsed.data);
      if (!result.ok) {
        setError(result.code === 'CONFLICT'
          ? 'Otra pestaña ha modificado este apunte. Tu texto sigue aquí; copia tus cambios antes de recargar.'
          : result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      const updated = 'note' in result.data ? result.data.note : result.data;
      draft.markConfirmed();
      savedRef.current = updated;
      setSavedNote(updated);
      const canonical = formFromNote(updated);
      setSavedKey(formKey(canonical));
      const responseMatchesInput = updated.title === parsed.data.title
        && updated.folderId === parsed.data.folderId
        && updated.contentMarkdown === parsed.data.contentMarkdown
        && updated.tags.join('\u0000') === parsed.data.tags.join('\u0000');
      const unchangedSinceSend = formKey(formRef.current) === formKey(snapshot);
      if (responseMatchesInput && unchangedSinceSend) {
        formRef.current = canonical;
        setForm(canonical);
        draft.clearOwn();
      }
      if (current === undefined && responseMatchesInput && formKey(formRef.current) === formKey(canonical)) {
        router.replace(`${notebookNoteHref(updated)}/editar`);
      }
    } catch {
      setError('No se pudo confirmar el guardado. Tu texto sigue en el editor; inténtalo de nuevo.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    if (!pendingChanges) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [pendingChanges]);

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
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
          if (pendingChanges && !window.confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) event.preventDefault();
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
      {recoveryConflict && <div role="alert" className={styles.draftNotice}>
        El apunte guardado cambió desde este borrador. Descarga tus cambios antes de volver a la versión guardada; el guardado está detenido para evitar sobrescribirla.
        <div className={styles.draftActions}>
          <button type="button" className={ui.secondary} onClick={draft.downloadCurrent}>Descargar borrador</button>
          <button type="button" className={ui.secondary} onClick={() => {
            if (savedRef.current === undefined) return;
            const original = formFromNote(savedRef.current);
            formRef.current = original;
            setForm(original);
            setRecoveryConflict(false);
            draft.resetToSaved();
          }}>Volver a versión guardada</button>
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
            disabled={editorLocked || pending && savedNote === undefined}
            aria-invalid={fieldErrors['title'] !== undefined}
            onChange={(event) => { change({ title: event.target.value }); }} />
          {fieldError('title')}
        </label>
        <label className={ui.field}>Carpeta
          <select className={ui.select} value={form.folderId ?? ''} disabled={editorLocked || pending && savedNote === undefined}
            onChange={(event) => { change({ folderId: event.target.value === '' ? null : Number(event.target.value) }); }}>
            <option value="">Sin carpeta</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>
              {folder.parentId === null ? folder.name : `${folders.find((parent) => parent.id === folder.parentId)?.name ?? ''} / ${folder.name}`}
            </option>)}
          </select>
          {fieldError('folderId')}
        </label>
        <label className={ui.field}>Etiquetas <span className={ui.optional}>separadas por comas</span>
          <input className={ui.input} value={form.tagsText} placeholder="gramática, part4" disabled={editorLocked || pending && savedNote === undefined}
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
          {pending ? 'Guardando…' : error !== null ? 'No guardado' : pendingChanges ? 'Sin guardar' : savedNote === undefined ? 'Nuevo apunte' : 'Guardado'}
        </span>
      </div>

      <div id="notebook-panel-edit" role="tabpanel" aria-labelledby="notebook-tab-edit" hidden={activeTab !== 'edit'}>
        <div role="toolbar" aria-label="Formato Markdown" className={styles.toolbar}>
          {([
            ['heading', 'Encabezado', 'H2'], ['bold', 'Negrita', 'B'], ['italic', 'Cursiva', 'I'],
            ['list', 'Lista', 'Lista'], ['quote', 'Cita', 'Cita'], ['link', 'Enlace', 'Enlace'],
          ] as const).map(([kind, label, text]) => (
            <button key={kind} type="button" className={`${ui.secondary} ${ui.compact}`} aria-label={label}
              disabled={editorLocked || pending && savedNote === undefined}
              onMouseDown={(event) => { event.preventDefault(); }}
              onClick={() => { applyFormatting(kind); }}>{text}</button>
          ))}
        </div>
        <label className={`${ui.field} ${styles.bodyLabel}`} htmlFor="notebook-body">Contenido Markdown</label>
        <textarea id="notebook-body" ref={textareaRef} className={`${ui.textarea} ${styles.textarea}`}
          value={form.contentMarkdown} disabled={editorLocked || pending && savedNote === undefined}
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
        <button type="button" className={ui.primary} disabled={pending || editorLocked || recoveryConflict || !pendingChanges} onClick={() => { void save(); }}>Guardar ahora</button>
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
    </div>
  );
}
