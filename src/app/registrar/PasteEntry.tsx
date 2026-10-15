'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { Messages } from '@/lib/i18n';
import { importPrompt, importTemplate, parseImportedBatch } from '@/lib/import/errors';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { sessionTitle } from '../_shared/format';
import { useT } from '../_shared/i18nClient';
import { useShortcutLabels } from '../_shared/shortcuts';
import { useImportHost } from './ImportHost';
import styles from './paste.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Pegado de correcciones. Detecta el formato al escribir (sesión con errores, solo
 * errores, JSON o TSV) y abre la revisión. No interpreta imágenes ni llama a ninguna IA:
 * las instrucciones para prepararlas con una IA externa están a mano.
 *
 * En Sesiones, Ctrl/⌘+V fuera de un campo pega y abre la revisión directamente.
 */

type Detection = { readonly tone: 'idle' | 'ok' | 'warn'; readonly text: string };

function detect(text: string, today: string, t: Messages): Detection {
  if (text.trim() === '') return { tone: 'idle', text: t.paste.detectIdle };
  try {
    const batch = parseImportedBatch(text, t, today);
    const n = batch.errors.length;
    return batch.session === null
      ? { tone: 'ok', text: t.paste.detectedRows(n) }
      : { tone: 'ok', text: t.paste.detectedSession(n) };
  } catch (error) {
    return { tone: 'warn', text: error instanceof Error ? error.message : t.paste.unrecognised };
  }
}

export function PasteEntry({ variant, globalPaste = false, onCancel }: {
  readonly variant: 'entry' | 'session';
  readonly globalPaste?: boolean;
  readonly onCancel?: () => void;
}) {
  const host = useImportHost();
  const keys = useShortcutLabels();
  const t = useT();
  const id = useId();
  const [problem, setProblem] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const instructions = useRef<HTMLTextAreaElement>(null);
  const deferred = useDeferredValue(host.text);
  const detection = useMemo(() => detect(deferred, host.today, t), [deferred, host.today, t]);
  const prompt = importPrompt(t);

  const review = (source: string) => {
    try {
      host.review(parseImportedBatch(source, t, host.today));
      setProblem('');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t.paste.unreadable);
      area.current?.focus();
    }
  };

  // Llegar desde la paleta con #pegar deja el cursor en el campo.
  useEffect(() => {
    if (variant === 'entry' && window.location.hash === '#pegar') area.current?.focus();
    if (variant === 'session') area.current?.focus();
  }, [variant]);

  const reviewRef = useRef(review);
  useEffect(() => { reviewRef.current = review; });
  useEffect(() => {
    if (!globalPaste) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('dialog[open], [data-overlay-open]') !== null) return;
      const pasted = event.clipboardData?.getData('text') ?? '';
      if (pasted.trim() === '') return;
      event.preventDefault();
      host.setText(pasted);
      reviewRef.current(pasted);
    };
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('paste', onPaste); };
  }, [globalPaste, host]);

  return (
    <div className={styles.entry}>
      {variant === 'entry' && <StoredDraftNotice />}

      <label htmlFor={id} className={ui.label}>
        {variant === 'entry' ? t.paste.labelEntry : t.paste.labelSession}
      </label>
      <textarea
        id={id}
        ref={area}
        rows={variant === 'entry' ? 3 : 4}
        className={`${ui.textarea} ${ui.mono}`}
        value={host.text}
        onChange={(event) => { host.setText(event.target.value); setProblem(''); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            review(host.text);
          }
        }}
        placeholder={variant === 'entry' ? t.paste.placeholderEntry : t.paste.placeholderSession}
        aria-invalid={problem !== '' || undefined}
        aria-describedby={`${id}-detect${problem === '' ? '' : ` ${id}-problem`}`}
      />
      {variant === 'session' && host.fixedTarget !== null && (
        <span className={ui.helpInfo}>
          {t.paste.headerIgnored(sessionTitle(host.fixedTarget, t))}
        </span>
      )}
      <div className={styles.actions}>
        <button type="button" className={ui.primary} onClick={() => { review(host.text); }}>{t.paste.review}</button>
        <span id={`${id}-detect`} className={detection.tone === 'ok' ? `${ui.help} ${ui.ok}` : detection.tone === 'warn' ? ui.helpWarn : ui.help}>
          {detection.text}
        </span>
        <span className={ui.spacer} />
        {variant === 'entry' && (
          <span className={`${ui.help} ${styles.keyHint}`}>
            {t.paste.pasteHint(keys.paste)}
          </span>
        )}
        {onCancel !== undefined && <button type="button" className={ui.ghost} onClick={onCancel}>{t.common.cancel}</button>}
      </div>
      {problem !== '' && <p id={`${id}-problem`} role="alert" className={ui.fieldError}>{problem}</p>}

      <div className={styles.help}>
        <details className={ui.disclosure}>
          <summary>
            <Info size={16} className={styles.infoIcon} aria-hidden="true" />
            {t.paste.formats}
          </summary>
          <div className={ui.disclosureBody}>
            <p>{t.paste.formatsBody}</p>
          </div>
        </details>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            {t.paste.aiTitle}
          </summary>
          <div className={`${ui.disclosureBody} ${styles.helpBody}`}>
            <ol className={styles.steps}>
              <li>{t.paste.aiStep1}</li>
              <li>{t.paste.aiStep2}</li>
              <li>{t.paste.aiStep3}</li>
            </ol>
            <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={() => {
              const selectInstructions = () => {
                instructions.current?.focus();
                instructions.current?.select();
                setCopyMessage(t.paste.copySelected);
              };
              // Sin contexto seguro no hay API de portapapeles: se seleccionan para copiarlas a mano.
              try {
                void navigator.clipboard.writeText(prompt).then(
                  () => { setCopyMessage(t.paste.copied); },
                  selectInstructions,
                );
              } catch {
                selectInstructions();
              }
            }}>{t.paste.copyButton}</button>
            <p role="status" className={ui.help}>{copyMessage}</p>
            <textarea ref={instructions} aria-label={t.paste.instructionsLabel} className={`${ui.textarea} ${ui.mono}`} value={prompt} readOnly rows={4} />
          </div>
        </details>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            {t.paste.templateTitle}
          </summary>
          <div className={`${ui.disclosureBody} ${styles.helpBody}`}>
            <p>{t.paste.templateBody}</p>
            <textarea aria-label={t.paste.templateLabel} className={`${ui.textarea} ${ui.mono}`} readOnly value={importTemplate(t)} rows={3} onFocus={(event) => { event.target.select(); }} />
          </div>
        </details>
      </div>

    </div>
  );
}

/**
 * Aviso de una revisión que no llegó a guardarse (se recargó la página o el guardado
 * quedó sin confirmar). Recuperarla abre la revisión tal como estaba.
 */
export function StoredDraftNotice() {
  const host = useImportHost();
  const t = useT();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const stored = host.stored;
  if (stored === null) return null;
  const destination = stored.targetId === null
    ? t.paste.storedNew(stored.header.sourceRef === null ? null : sessionTitle(stored.header, t))
    : t.paste.storedTarget;
  return (
    <div className={`${ui.notice} ${styles.stored}`} role="status">
      <span className={ui.noticeTitleWarn}>{t.paste.storedTitle}</span>
      <span className={styles.storedText}>
        {t.paste.storedText(stored.rows.length, destination)}
      </span>
      <span className={styles.storedActions}>
        <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={host.recover}>{t.paste.recover}</button>
        <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => { setConfirmDiscard(true); }}>{t.paste.discard}</button>
      </span>
      <ConfirmDialog
        open={confirmDiscard}
        title={t.paste.discardTitle}
        confirmLabel={t.paste.discardConfirm}
        pendingLabel={t.common.discarding}
        aside={t.common.cannotUndo}
        onCancel={() => { setConfirmDiscard(false); }}
        onConfirm={() => {
          host.discardStored();
          setConfirmDiscard(false);
        }}
      >
        <p>{t.paste.discardBody}</p>
      </ConfirmDialog>
    </div>
  );
}
