'use client';

import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';

import { GENRES, SOURCES, type Genre, type Source } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';
import type { ImportIssue } from '@/lib/writing/contract';
import { WRITING_LIMITS } from '@/lib/writing/limits';
import type { FieldChange, ImportDecision, PlanError, PlanWarning } from '@/lib/writing/plan';
import type { AnnotationView, WritingImportView } from '@/lib/writing/previewView';
import { writingPrompt } from '@/lib/writing/prompt';
import { paragraphsOf } from '@/lib/writing/text';
import { decimal, mediumDate, percent } from '../../_shared/format';
import { useT } from '../../_shared/i18nClient';
import { useToast } from '../../_shared/Toast';
import ui from '../../_shared/ui.module.css';
import { BANDS } from '../bands';
import { importWritingAction, previewWritingImportAction } from '../importActions';
import styles from './import.module.css';

/**
 * Importar una redacción: pegar (o elegir) el JSON, revisar la vista previa y confirmar.
 * La vista previa la calcula el servidor y no guarda nada; confirmar envía el `digest` de
 * lo que se vio y un `importId` fijado al revisar, así que un doble clic o un reintento no
 * duplican. El texto de la redacción se enseña tal cual llega: sin formato ni correcciones.
 */

export interface LinkedSession {
  readonly id: number;
  readonly title: string;
  readonly date: string;
}

const noSubscription = () => () => {};
const pct = (value: number, t: Messages) => percent(Math.round(value * 100), t);

function warningText(warning: PlanWarning, t: Messages): string {
  const w = t.writingImport.warning;
  switch (warning.code) {
    case 'totalMismatch': return w.totalMismatch(decimal(warning.total, t), decimal(warning.sum, t));
    case 'totalIncomplete': return w.totalIncomplete(decimal(warning.total, t));
    case 'textDiffers': return w.textDiffers(pct(warning.similarity, t));
    case 'dateFallback': return warning.basis === 'CORRECTED'
      ? w.dateCorrected(mediumDate(warning.date, t))
      : w.dateImported(mediumDate(warning.date, t));
  }
}

function errorText(error: PlanError, t: Messages): string {
  const e = t.writingImport.error;
  switch (error.code) {
    case 'targetMissing': return e.targetMissing;
    case 'paragraphOutOfRange': return e.paragraphOutOfRange(error.index, error.paragraph, error.paragraphs);
    case 'correctedBeforeWritten': return e.correctedBeforeWritten(mediumDate(error.date, t), mediumDate(error.correctedOn, t));
  }
}

const shorten = (value: string) => (value.length > 90 ? `${value.slice(0, 89)}…` : value);

function changeValue(change: FieldChange, value: FieldChange['before'], t: Messages): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? t.writingImport.yes : t.writingImport.no;
  if (typeof value === 'number') return decimal(value, t);
  switch (change.field) {
    case 'genre': return t.labels.genre[value as Genre];
    case 'status': return t.labels.writingStatus[value as keyof Messages['labels']['writingStatus']];
    case 'corrector': return t.labels.corrector[value as keyof Messages['labels']['corrector']];
    case 'date':
    case 'correctedOn': return mediumDate(value, t);
    default: return shorten(value);
  }
}

function annotationLine(item: AnnotationView, t: Messages): string {
  const w = t.writingImport;
  const parts = [w.annotationLabel(item.index, t.labels.annotationKind[item.kind])];
  if (item.quote !== null) parts.push(`“${shorten(item.quote)}”`);
  if (item.paragraph !== null) parts.push(w.inParagraph(item.paragraph));
  if (item.reason === 'notFound') parts.push(w.reason.notFound);
  if (item.reason === 'several') parts.push(w.reason.several(item.candidates));
  if (item.reason === 'contradicts') parts.push(w.reason.contradicts);
  return parts.join(' · ');
}

export function WritingImport({ linkedSession }: { readonly linkedSession: LinkedSession | null }) {
  const t = useT();
  const w = t.writingImport;
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  // Sin hidratar, lo que se teclea o pulsa se perdería: los controles esperan al navegador.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const [source, setSource] = useState('');
  const [reviewed, setReviewed] = useState<{ readonly source: string; readonly importId: string } | null>(null);
  const [view, setView] = useState<WritingImportView | null>(null);
  const [issues, setIssues] = useState<readonly ImportIssue[]>([]);
  const [writtenOn, setWrittenOn] = useState(linkedSession?.date ?? '');
  const [sessionSource, setSessionSource] = useState<Source>('ACADEMIA');
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [manual, setManual] = useState<{ title: string; type: Genre; text: string }>({ title: '', type: 'ESSAY', text: '' });
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();
  const requestRef = useRef(0);
  const instructions = useRef<HTMLTextAreaElement>(null);
  const prompt = writingPrompt(t);

  /** Vacía es «no la sé»: se usa la de corrección o la de hoy, marcada como aproximada. */
  const writtenOnOption = (value: string) => (value === '' ? null : value);

  function review(text: string, choice: { readonly decision?: ImportDecision; readonly date?: string } = {}) {
    const request = ++requestRef.current;
    setMessage(null);
    startChecking(async () => {
      try {
        const result = await previewWritingImportAction(text, {
          ...(choice.decision === undefined ? {} : { decision: choice.decision }),
          writtenOn: writtenOnOption(choice.date ?? writtenOn),
        });
        if (request !== requestRef.current) return;
        if (!result.ok) {
          setView(null);
          setIssues(result.issues);
          return;
        }
        setIssues([]);
        setView(result.view);
        // Un `importId` por texto revisado: cambiar destino o fecha no cuenta como otra importación.
        setReviewed((previous) => (previous?.source === text ? previous : { source: text, importId: crypto.randomUUID() }));
      } catch {
        if (request === requestRef.current) setMessage(w.reviewFailed);
      }
    });
  }

  function edit(text: string) {
    setSource(text);
    setView(null);
    setIssues([]);
  }

  async function choose(file: File | null) {
    if (file === null) return;
    try {
      const text = await file.text();
      edit(text);
      review(text);
    } catch {
      setMessage(w.readFailed);
    }
  }

  function reviewManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const json = JSON.stringify({
      format: 'error-log-writing',
      version: 1,
      writing: { title: manual.title, type: manual.type, text: manual.text },
    }, null, 2);
    edit(json);
    review(json);
  }

  function copyInstructions() {
    const selectInstructions = () => {
      instructions.current?.focus();
      instructions.current?.select();
      setCopyMessage(t.paste.copySelected);
    };
    // Sin contexto seguro no hay API de portapapeles: se seleccionan para copiarlas a mano.
    try {
      void navigator.clipboard.writeText(prompt).then(() => { setCopyMessage(t.paste.copied); }, selectInstructions);
    } catch {
      selectInstructions();
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === null || reviewed === null || saving || checking) return;
    const sent = reviewed;
    const options = {
      importId: sent.importId, decision: view.decision, writtenOn: writtenOnOption(writtenOn), sessionSource,
      sessionId: linkedSession?.id ?? null, digest: view.digest,
    };
    startSaving(async () => {
      try {
        const result = await importWritingAction(sent.source, options);
        if (result.ok) {
          toast({ message: result.message });
          router.push(result.href);
          return;
        }
        if (result.reload) {
          setReviewed({ source: sent.source, importId: crypto.randomUUID() });
          review(sent.source, { decision: view.decision });
        }
        if (result.issues !== undefined) setIssues(result.issues);
        setMessage(result.message);
      } catch {
        setMessage(w.uncertain);
      }
    });
  }

  const destinations = view === null ? [] : [
    ...(view.target !== null && !view.suggestions.some((item) => item.uid === view.target?.uid)
      ? [{ uid: view.target.uid, title: view.target.title, similarity: null }] : []),
    ...view.suggestions,
  ];
  const targetSimilarity = view?.suggestions.find((item) => item.uid === view.target?.uid)?.similarity ?? null;
  const scores = view === null ? [] : BANDS.map((band) => ({ ...band, value: view.values[band.name] }));
  const given = scores.flatMap((band) => (band.value === null ? [] : [band.value]));
  const counts = view === null ? [] : (['placed', 'loose', 'unplaced', 'paragraph', 'document', 'duplicate'] as const)
    .map((outcome) => ({ outcome, n: view.annotations.filter((item) => item.outcome === outcome).length }))
    .filter((count) => count.n > 0);
  const unplaced = view?.annotations.filter((item) => item.outcome === 'unplaced') ?? [];
  const loose = view?.annotations.filter((item) => item.outcome === 'loose') ?? [];
  const blocked = view !== null && (view.errors.length > 0 || view.nothingToDo);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{t.nav.writing}</p>
          <h1 className={ui.pageTitle}>{w.title}</h1>
          <p className={styles.intro}>{w.intro}</p>
        </div>
        <Link href="/writing" className={ui.backLink}>
          <ArrowLeft size={16} aria-hidden="true" />
          {w.backToWriting}
        </Link>
      </div>

      <div className={styles.entry}>
        <label className={ui.field}>{w.jsonLabel}
          <textarea className={`${ui.textarea} ${styles.source}`} value={source} spellCheck={false}
            maxLength={WRITING_LIMITS.importChars} disabled={!ready || saving}
            onChange={(event) => { edit(event.target.value); }} />
        </label>
        <div className={styles.entryActions}>
          <button type="button" className={ui.primary} disabled={!ready || saving || checking || source.trim() === ''}
            aria-busy={checking} onClick={() => { review(source, {}); }}>
            {checking ? w.reviewing : w.review}
          </button>
          <label className={styles.file}>
            {w.fileLabel}
            <input type="file" accept=".json,application/json" disabled={!ready || saving}
              onChange={(event) => { void choose(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ''; }} />
          </label>
        </div>
        {linkedSession !== null && <p className={ui.help}>{w.linkedSession(linkedSession.title)}</p>}
        {message !== null && view === null && <p role="alert" className={ui.fieldError}>{message}</p>}
      </div>

      <div className={styles.helpers}>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            {w.aiTitle}
          </summary>
          <div className={`${ui.disclosureBody} ${styles.helpBody}`}>
            <ol className={styles.steps}>
              <li>{w.aiStep1}</li>
              <li>{w.aiStep2}</li>
              <li>{w.aiStep3}</li>
            </ol>
            <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={copyInstructions}>{t.paste.copyButton}</button>
            <p role="status" className={ui.help}>{copyMessage}</p>
            <textarea ref={instructions} aria-label={t.paste.instructionsLabel} className={`${ui.textarea} ${ui.mono}`}
              value={prompt} readOnly rows={4} />
          </div>
        </details>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            {w.manualTitle}
          </summary>
          <form className={`${ui.disclosureBody} ${styles.manual}`} onSubmit={reviewManual}>
            <div className={styles.manualRow}>
              <label className={ui.field}>{w.manualTitleField}
                <input className={ui.input} value={manual.title} maxLength={WRITING_LIMITS.title} required disabled={!ready}
                  onChange={(event) => { setManual({ ...manual, title: event.target.value }); }} />
              </label>
              <div className={ui.field}>
                <label htmlFor={`${id}-type`}>{w.field.genre}</label>
                <select id={`${id}-type`} className={ui.select} value={manual.type} disabled={!ready}
                  onChange={(event) => { setManual({ ...manual, type: event.target.value as Genre }); }}>
                  {GENRES.map((genre) => <option key={genre} value={genre}>{t.labels.genre[genre]}</option>)}
                </select>
              </div>
            </div>
            <label className={ui.field}>{w.manualTextField}
              <textarea className={`${ui.textarea} ${styles.manualText}`} value={manual.text} required
                maxLength={WRITING_LIMITS.text} disabled={!ready}
                onChange={(event) => { setManual({ ...manual, text: event.target.value }); }} />
            </label>
            <div>
              <button type="submit" className={`${ui.secondary} ${ui.compact}`} disabled={!ready || checking}>{w.manualReview}</button>
            </div>
          </form>
        </details>
      </div>

      {issues.length > 0 && (
        <section className={styles.issues} aria-labelledby={`${id}-issues`}>
          <h2 id={`${id}-issues`}>{w.issuesTitle}</h2>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${String(index)}`}>
                <code className={styles.path}>{issue.path === '' ? w.issueRoot : issue.path}</code> {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view !== null && (
        <form className={styles.preview} onSubmit={confirm} aria-labelledby={`${id}-preview`}>
          <div className={styles.previewHead}>
            <h2 id={`${id}-preview`}>
              {view.decision.mode === 'create' ? w.newWriting : w.updateOf(view.target?.title ?? w.untitled)}
            </h2>
            {view.matchedBy !== null && (
              <p className={ui.help}>
                {view.matchedBy === 'similarity'
                  ? w.matchedBy.similarity(targetSimilarity === null ? '—' : pct(targetSimilarity, t))
                  : w.matchedBy[view.matchedBy]}
              </p>
            )}
          </div>

          {destinations.length > 0 && (
            <fieldset className={styles.destinations} disabled={checking || saving}>
              <legend>{w.destination}</legend>
              {destinations.map((item) => (
                <label key={item.uid} className={ui.check}>
                  <input type="radio" name={`${id}-destination`}
                    checked={view.decision.mode === 'update' && view.decision.uid === item.uid}
                    onChange={() => { review(reviewed?.source ?? source, { decision: { mode: 'update', uid: item.uid } }); }} />
                  {item.similarity === null
                    ? w.updateOf(item.title ?? w.untitled)
                    : w.updateOption(item.title ?? w.untitled, pct(item.similarity, t))}
                </label>
              ))}
              <label className={ui.check}>
                <input type="radio" name={`${id}-destination`} checked={view.decision.mode === 'create'}
                  onChange={() => { review(reviewed?.source ?? source, { decision: { mode: 'create' } }); }} />
                {w.createNew}
              </label>
            </fieldset>
          )}

          {view.errors.length > 0 && (
            <section className={styles.blocked} aria-labelledby={`${id}-blocked`}>
              <h3 id={`${id}-blocked`}>{w.blockedTitle}</h3>
              <ul>{view.errors.map((error) => <li key={JSON.stringify(error)}>{errorText(error, t)}</li>)}</ul>
            </section>
          )}
          {view.warnings.length > 0 && (
            <section className={styles.notices} aria-labelledby={`${id}-notices`}>
              <h3 id={`${id}-notices`}>{w.beforeImport}</h3>
              <ul>{view.warnings.map((warning) => <li key={warning.code}>{warningText(warning, t)}</li>)}</ul>
            </section>
          )}
          {view.nothingToDo && <p role="status" className={styles.nothing}>{w.nothingToDo}</p>}

          {view.changes.length > 0 && (
            <section className={styles.block} aria-labelledby={`${id}-changes`}>
              <h3 id={`${id}-changes`}>{w.changesTitle}</h3>
              <ul className={styles.list}>
                {view.changes.map((change) => (
                  <li key={change.field}>
                    {change.field === 'originalText' ? w.transcriptionAdded : (
                      <>{w.field[change.field]}: {changeValue(change, change.before, t)} → <strong>{changeValue(change, change.after, t)}</strong></>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.layout}>
            <article className={styles.paper} aria-label={w.originalText}>
              <h3 className={styles.paperTitle}>{view.values.title ?? w.untitled}</h3>
              <p className={styles.paperMeta}>
                {t.labels.genre[view.values.genre]} · {t.writing.words(view.wordCount)}
              </p>
              <div className={styles.text}>
                {paragraphsOf(view.text).map((paragraph) => (
                  <p key={paragraph.number}>{view.text.slice(paragraph.start, paragraph.end)}</p>
                ))}
              </div>
            </article>

            <div className={styles.aside}>
              <section className={styles.block} aria-labelledby={`${id}-details`}>
                <h3 id={`${id}-details`}>{w.detailsTitle}</h3>
                <dl className={styles.details}>
                  <dt>{w.field.genre}</dt>
                  <dd>{t.labels.genre[view.values.genre]}</dd>
                  <dt>{w.written}</dt>
                  <dd>
                    {mediumDate(view.values.date, t)}
                    {view.values.dateBasis !== 'WRITTEN' && <span className={ui.optional}> · {w.approximate}</span>}
                  </dd>
                  <dt>{w.corrected}</dt>
                  <dd>{view.values.correctedOn === null ? '—' : mediumDate(view.values.correctedOn, t)}</dd>
                  <dt>{w.field.status}</dt>
                  <dd>{t.labels.writingStatus[view.values.status]}</dd>
                  <dt>{w.field.corrector}</dt>
                  <dd>{view.values.corrector === null ? '—' : t.labels.corrector[view.values.corrector]}</dd>
                </dl>
                {!view.writtenOnInJson && (
                  <label className={ui.field}>{w.dateWritten}
                    <input type="date" className={ui.input} value={writtenOn} max={new Date().toISOString().slice(0, 10)}
                      disabled={checking || saving}
                      onChange={(event) => {
                        setWrittenOn(event.target.value);
                        review(reviewed?.source ?? source, { decision: view.decision, date: event.target.value });
                      }} />
                    <span className={ui.help}>{w.dateHelp}</span>
                  </label>
                )}
              </section>

              <section className={styles.block} aria-labelledby={`${id}-assessment`}>
                <h3 id={`${id}-assessment`}>{w.assessmentTitle}</h3>
                {given.length === 0 ? <p className={ui.help}>{w.notAssessed}</p> : (
                  <dl className={styles.details}>
                    {scores.map((band) => (
                      <div key={band.name} className={styles.score}>
                        <dt>{band.label}</dt>
                        <dd className="num">{band.value === null ? '—' : decimal(band.value, t)}</dd>
                      </div>
                    ))}
                    <div className={styles.score}>
                      <dt>{w.totalLabel}</dt>
                      <dd className="num">
                        <strong>{given.length === 4 ? w.total(decimal(given.reduce((sum, value) => sum + value, 0), t)) : w.partial(given.length)}</strong>
                      </dd>
                    </div>
                  </dl>
                )}
                {view.values.teacherComment !== null && (
                  <figure className={styles.comment}>
                    <figcaption>{w.teacherComment}</figcaption>
                    <blockquote>{view.values.teacherComment}</blockquote>
                  </figure>
                )}
              </section>

              <section className={styles.block} aria-labelledby={`${id}-annotations`}>
                <h3 id={`${id}-annotations`}>{w.annotationsTitle}</h3>
                {counts.length === 0 ? <p className={ui.help}>{w.noAnnotations}</p> : (
                  <ul className={styles.list}>
                    {counts.map((count) => <li key={count.outcome}>{w.outcome[count.outcome](count.n)}</li>)}
                  </ul>
                )}
                {unplaced.length > 0 && (
                  <div className={styles.group}>
                    <h4>{w.toPlace}</h4>
                    <ul className={styles.list}>{unplaced.map((item) => <li key={item.index}>{annotationLine(item, t)}</li>)}</ul>
                  </div>
                )}
                {loose.length > 0 && (
                  <div className={styles.group}>
                    <h4>{w.loosely}</h4>
                    <ul className={styles.list}>{loose.map((item) => <li key={item.index}>{annotationLine(item, t)}</li>)}</ul>
                  </div>
                )}
              </section>
            </div>
          </div>

          {view.decision.mode === 'create' && linkedSession === null && (
            <div className={`${ui.field} ${styles.sessionSource}`}>
              <label htmlFor={`${id}-source`}>{w.sessionSource}</label>
              <select id={`${id}-source`} className={ui.select} value={sessionSource} disabled={saving}
                onChange={(event) => { setSessionSource(event.target.value as Source); }}>
                {SOURCES.map((value) => <option key={value} value={value}>{t.labels.source[value]}</option>)}
              </select>
            </div>
          )}

          <div className={styles.actions}>
            <button type="submit" className={ui.primary} disabled={blocked || checking || saving} aria-busy={saving}>
              {saving ? w.importing : view.decision.mode === 'create' ? w.confirmCreate : w.confirmUpdate}
            </button>
            <Link href="/writing" className={ui.secondary}>{t.common.cancel}</Link>
            {message !== null && <p role="alert" className={ui.fieldError}>{message}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
