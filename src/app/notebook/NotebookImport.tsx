'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import type { NotebookImportDraft } from '@/lib/notebook/import';
import { analyzeNotebookMarkdown } from '@/lib/notebook/markdown';
import { NOTEBOOK_IMPORT_ACCEPT, NOTEBOOK_LIMITS, notebookImportSizeError } from '@/lib/notebook/schemas';
import type { NotebookFolder } from '@/lib/notebook/types';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { importMarkdownAction, previewMarkdownImportAction } from './actions';
import { MarkdownRenderer } from './MarkdownRenderer';
import editor from './editor.module.css';
import styles from './import.module.css';

type Form = { title: string; tagsText: string; folderId: number | null };
/** El UID se fija al analizar: reintentar la confirmación no crea un segundo apunte. */
type Preview = { draft: NotebookImportDraft; uid: string };

/**
 * Un `.md` por vez: el servidor lo analiza, aquí se revisan título, carpeta y etiquetas,
 * y al confirmar el servidor lo vuelve a leer. Nada se guarda hasta «Crear apunte».
 */
export function NotebookImport({ folders, initialFolderId }: {
  readonly folders: readonly NotebookFolder[];
  readonly initialFolderId: number | null;
}) {
  const t = useT();
  const n = t.notebook;
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<Form>({ title: '', tagsText: '', folderId: initialFolderId });
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [analyzing, startAnalyzing] = useTransition();
  const [saving, startSaving] = useTransition();
  // Si se elige otro archivo mientras se analiza el anterior, gana el último.
  const requestRef = useRef(0);

  const choose = (next: File | null) => {
    const request = ++requestRef.current;
    setFile(next);
    setPreview(null);
    setFileError(null);
    setError(null);
    setFieldErrors({});
    if (next === null) return;
    const sizeError = notebookImportSizeError(next.size, t);
    if (sizeError !== null) { setFileError(sizeError); return; }
    const data = new FormData();
    data.set('file', next);
    startAnalyzing(async () => {
      try {
        const result = await previewMarkdownImportAction(data);
        if (request !== requestRef.current) return;
        if (!result.ok) { setFileError(result.message); return; }
        setPreview({ draft: result.data, uid: crypto.randomUUID() });
        setForm({ title: result.data.title, tagsText: result.data.tags.join(', '), folderId: initialFolderId });
      } catch {
        if (request === requestRef.current) setFileError(n.analyseFailed);
      }
    });
  };

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file === null || preview === null || saving) return;
    const data = new FormData();
    data.set('file', file);
    data.set('uid', preview.uid);
    data.set('contentHash', preview.draft.contentHash);
    data.set('title', form.title);
    data.set('folderId', form.folderId === null ? '' : String(form.folderId));
    const tags = form.tagsText.trim() === '' ? [] : form.tagsText.split(',').map((tag) => tag.trim());
    for (const tag of tags) data.append('tags', tag);
    setError(null);
    setFieldErrors({});
    startSaving(async () => {
      try {
        const result = await importMarkdownAction(data);
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          if (result.fieldErrors?.['file'] !== undefined) { setPreview(null); setFileError(result.message); }
          else setError(result.message);
          return;
        }
        router.push(result.data.href);
      } catch {
        setError(n.importUncertain);
      }
    });
  };

  /** Zod señala `tags.1` para una etiqueta concreta: se enseña bajo el campo entero. */
  function fieldError(name: string) {
    const messages = Object.entries(fieldErrors)
      .filter(([key]) => key === name || key.startsWith(`${name}.`))
      .flatMap(([, value]) => value);
    return messages.length === 0 ? null : <p className={ui.fieldError} role="alert">{messages.join(' ')}</p>;
  }

  const draft = preview?.draft;
  const firstHeading = draft === undefined ? undefined : analyzeNotebookMarkdown(draft.contentMarkdown).headings[0];
  const hideFirstH1 = firstHeading?.depth === 1 && firstHeading.text === form.title.trim();
  const notices = draft === undefined ? [] : [
    ...draft.warnings.map((warning) => warning.message),
    ...(draft.unknownFields.length > 0 ? [n.unknownFields(draft.unknownFields.join(', '))] : []),
    ...(draft.ignoredFields.length > 0 ? [n.ignoredFields(draft.ignoredFields.join(', '))] : []),
  ];

  return (
    <div className={editor.editor}>
      <div className={editor.heading}>
        <div>
          <p className={editor.eyebrow}>{t.nav.notebook}</p>
          <h1>{n.importNote}</h1>
        </div>
        <Link href="/notebook" className={ui.backLink}>{n.backToNotebook}</Link>
      </div>

      <div className={styles.chooser}>
        <label className={ui.field}>{n.markdownFile}
          <span className={ui.optional}>
            {n.fileHint(NOTEBOOK_LIMITS.contentBytes / 1024)}
          </span>
          <input type="file" accept={NOTEBOOK_IMPORT_ACCEPT} disabled={saving}
            aria-invalid={fileError !== null}
            onChange={(event) => { choose(event.currentTarget.files?.[0] ?? null); }} />
        </label>
        <p className={ui.help}>{n.importHelp}</p>
        {analyzing && <p role="status" className={ui.help}>{n.analysing}</p>}
        {fileError !== null && <p role="alert" className={ui.fieldError}>{fileError}</p>}
      </div>

      {preview !== null && draft !== undefined && (
        <form className={editor.editor} onSubmit={confirm} aria-label={n.importFile(draft.fileName)}>
          <div className={editor.metaFields}>
            <label className={ui.field}>{n.title}
              <input className={ui.input} value={form.title} maxLength={NOTEBOOK_LIMITS.title} required disabled={saving}
                aria-invalid={fieldErrors['title'] !== undefined}
                onChange={(event) => { setForm({ ...form, title: event.target.value }); }} />
              <span className={ui.help}>{n.titleSource[draft.titleSource]}</span>
              {fieldError('title')}
            </label>
            <label className={ui.field}>{n.folder}
              <select className={ui.select} value={form.folderId ?? ''} disabled={saving}
                onChange={(event) => { setForm({ ...form, folderId: event.target.value === '' ? null : Number(event.target.value) }); }}>
                <option value="">{n.noFolder}</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>
                  {folder.parentId === null ? folder.name : `${folders.find((parent) => parent.id === folder.parentId)?.name ?? ''} / ${folder.name}`}
                </option>)}
              </select>
              {fieldError('folderId')}
            </label>
            <label className={ui.field}>{n.tags} <span className={ui.optional}>{n.commaSeparated}</span>
              <input className={ui.input} value={form.tagsText} placeholder={n.tagsPlaceholder} disabled={saving}
                aria-invalid={fieldError('tags') !== null}
                onChange={(event) => { setForm({ ...form, tagsText: event.target.value }); }} />
              {fieldError('tags')}
            </label>
          </div>

          <section className={styles.notices} aria-labelledby="notebook-import-notices">
            <h2 id="notebook-import-notices">{n.beforeImport}</h2>
            {notices.length === 0 ? <p className={ui.help}>{n.noNotices}</p> : (
              <ul>{notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
            )}
          </section>

          <section aria-label={n.notePreview}>
            <article className={editor.preview}>
              <h1 id={hideFirstH1 ? firstHeading.slug : undefined} className={editor.previewTitle}>{form.title.trim() || n.untitled}</h1>
              {draft.contentMarkdown === '' ? <p className={ui.help}>{n.fileEmpty}</p> : (
                <MarkdownRenderer markdown={draft.contentMarkdown} hideFirstH1={hideFirstH1} t={t} />
              )}
            </article>
          </section>

          <div className={editor.actions}>
            <button type="submit" className={ui.primary} disabled={saving} aria-busy={saving}>
              {saving ? n.creating : n.createNote}
            </button>
            <Link href="/notebook" className={ui.secondary}>{t.common.cancel}</Link>
            {error !== null && <p role="alert" className={ui.fieldError}>{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
