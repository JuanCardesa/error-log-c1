'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import { IMPORT_PROMPT, IMPORT_TEMPLATE, parseImportedBatch } from '@/lib/import/errors';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { sessionTitle } from '../_shared/format';
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

function detect(text: string, today: string): Detection {
  if (text.trim() === '') return { tone: 'idle', text: 'Sesión con errores, solo errores, JSON o TSV' };
  try {
    const batch = parseImportedBatch(text, today);
    const n = batch.errors.length;
    const errors = `${String(n)} ${n === 1 ? 'error' : 'errores'}`;
    return batch.session === null
      ? { tone: 'ok', text: `Detectado: ${errors} sin cabecera` }
      : { tone: 'ok', text: `Detectado: sesión + ${errors}` };
  } catch (error) {
    return { tone: 'warn', text: error instanceof Error ? error.message : 'No se reconoce el formato.' };
  }
}

export function PasteEntry({ variant, globalPaste = false, onCancel }: {
  readonly variant: 'entry' | 'session';
  readonly globalPaste?: boolean;
  readonly onCancel?: () => void;
}) {
  const host = useImportHost();
  const keys = useShortcutLabels();
  const id = useId();
  const [problem, setProblem] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const instructions = useRef<HTMLTextAreaElement>(null);
  const deferred = useDeferredValue(host.text);
  const detection = useMemo(() => detect(deferred, host.today), [deferred, host.today]);

  const review = (source: string) => {
    try {
      host.review(parseImportedBatch(source, host.today));
      setProblem('');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'No se pudo leer el texto.');
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
        {variant === 'entry' ? 'Pegar correcciones' : 'Errores para añadir a esta sesión'}
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
        placeholder={variant === 'entry'
          ? 'Pega aquí la tanda copiada desde Macmillan, JSON o TSV'
          : 'JSON, TSV o una fila por error (1–100 errores)'}
        aria-invalid={problem !== '' || undefined}
        aria-describedby={`${id}-detect${problem === '' ? '' : ` ${id}-problem`}`}
      />
      {variant === 'session' && host.fixedTarget !== null && (
        <span className={ui.helpInfo}>
          Si el texto trae cabecera de sesión, no sustituye ni suma los recuentos de «{sessionTitle(host.fixedTarget)}».
        </span>
      )}
      <div className={styles.actions}>
        <button type="button" className={ui.primary} onClick={() => { review(host.text); }}>Revisar importación</button>
        <span id={`${id}-detect`} className={detection.tone === 'ok' ? `${ui.help} ${ui.ok}` : detection.tone === 'warn' ? ui.helpWarn : ui.help}>
          {detection.text}
        </span>
        <span className={ui.spacer} />
        {variant === 'entry' && (
          <span className={`${ui.help} ${styles.keyHint}`}>
            {keys.paste} fuera de un campo pega y abre la revisión
          </span>
        )}
        {onCancel !== undefined && <button type="button" className={ui.ghost} onClick={onCancel}>Cancelar</button>}
      </div>
      {problem !== '' && <p id={`${id}-problem`} role="alert" className={ui.fieldError}>{problem}</p>}

      <div className={styles.help}>
        <details className={ui.disclosure}>
          <summary>
            <Info size={16} className={styles.infoIcon} aria-hidden="true" />
            Formatos admitidos
          </summary>
          <div className={ui.disclosureBody}>
            <p>
              El bloque «Copiar tanda» del capturador de Macmillan trae sesión y errores (hasta 300). También vale un
              JSON solo con errores o filas copiadas de una hoja de cálculo con cabeceras (hasta 100). Máximo 200.000
              caracteres. La app no lee imágenes.
            </p>
          </div>
        </details>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            Preparar correcciones con IA
          </summary>
          <div className={`${ui.disclosureBody} ${styles.helpBody}`}>
            <ol className={styles.steps}>
              <li>Copia estas instrucciones en la IA que uses y pega tus correcciones, o adjunta fotos si esa IA admite imágenes.</li>
              <li>En las fotos, incluye el ejercicio, tu respuesta y la corrección. Usa imágenes de una sola sesión.</li>
              <li>Pega aquí el bloque que te devuelva y revisa la importación.</li>
            </ol>
            <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={() => {
              const selectInstructions = () => {
                instructions.current?.focus();
                instructions.current?.select();
                setCopyMessage('Seleccionadas: pulsa Ctrl+C para copiarlas.');
              };
              // Sin contexto seguro no hay API de portapapeles: se seleccionan para copiarlas a mano.
              try {
                void navigator.clipboard.writeText(IMPORT_PROMPT).then(
                  () => { setCopyMessage('Instrucciones copiadas. Pégalas junto a tus correcciones.'); },
                  selectInstructions,
                );
              } catch {
                selectInstructions();
              }
            }}>Copiar instrucciones para la IA</button>
            <p role="status" className={ui.help}>{copyMessage}</p>
            <textarea ref={instructions} aria-label="Instrucciones para la IA" className={`${ui.textarea} ${ui.mono}`} value={IMPORT_PROMPT} readOnly rows={4} />
          </div>
        </details>
        <details className={ui.disclosure}>
          <summary>
            <ChevronRight size={14} className="chevron" aria-hidden="true" />
            Plantilla para hoja de cálculo
          </summary>
          <div className={`${ui.disclosureBody} ${styles.helpBody}`}>
            <p>Copia las celdas con sus cabeceras: Ítem, Enunciado, Mi respuesta, Correcta, Categoría y Regla. Puedes añadir Causa, Confianza y Subcategoría.</p>
            <textarea aria-label="Plantilla para hoja de calculo" className={`${ui.textarea} ${ui.mono}`} readOnly value={IMPORT_TEMPLATE} rows={3} onFocus={(event) => { event.target.select(); }} />
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const stored = host.stored;
  if (stored === null) return null;
  const destination = stored.targetId === null
    ? `sesión nueva${stored.header.sourceRef === null ? '' : ` «${sessionTitle(stored.header)}»`}`
    : 'para esta sesión abierta';
  return (
    <div className={`${ui.notice} ${styles.stored}`} role="status">
      <span className={ui.noticeTitleWarn}>Tanda sin guardar</span>
      <span className={styles.storedText}>
        {stored.rows.length} {stored.rows.length === 1 ? 'error' : 'errores'} · {destination}.
        {' '}Si un guardado quedó sin confirmar, comprueba antes la lista de sesiones.
      </span>
      <span className={styles.storedActions}>
        <button type="button" className={`${ui.secondary} ${ui.compact}`} onClick={host.recover}>Recuperar</button>
        <button type="button" className={`${ui.ghost} ${ui.compact}`} onClick={() => { setConfirmDiscard(true); }}>Descartar</button>
      </span>
      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar la tanda sin guardar"
        confirmLabel="Descartar tanda"
        pendingLabel="Descartando…"
        aside="No se puede deshacer."
        onCancel={() => { setConfirmDiscard(false); }}
        onConfirm={() => {
          host.discardStored();
          setConfirmDiscard(false);
        }}
      >
        <p>Se borra de este navegador la revisión que no llegó a guardarse. Las sesiones guardadas no cambian.</p>
      </ConfirmDialog>
    </div>
  );
}
