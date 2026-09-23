'use client';

import { type FormEvent, useActionState, useEffect, useRef, useState } from 'react';

import { errorsForRow, IMPORT_PROMPT, IMPORT_TEMPLATE, parseImportedBatch, type ImportDraft, type ImportedSession } from '@/lib/import/errors';
import type { SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import { importErrorsAction, importSessionAction } from './importActions';
import { SessionFields } from './SessionFields';
import { MISSING_LABELS, buildImportPayload, missingFields, readRow, snapshotFromDraft, type MissingField, type RowSnapshot } from './reviewRows';
import headerStyles from './session.module.css';
import styles from './bulk.module.css';
import { KIND_LABELS } from '../_shared/labels';
import ui from '../_shared/ui.module.css';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
}

const EMPTY_SNAPSHOT: RowSnapshot = { itemRef: '', prompt: '', myAnswer: '', correctAnswer: '', category: '', ruleNote: '' };

function RowStatus({ missing, rejected }: { readonly missing: readonly MissingField[]; readonly rejected: boolean }) {
  if (rejected) return <span className={styles.statusRejected}>Rechazado: revisa los campos marcados</span>;
  if (missing.length > 0) return <span className={styles.statusPending}>Falta: {missing.map((field) => MISSING_LABELS[field]).join(', ')}</span>;
  // Listo para enviar, no «validado»: las reglas de negocio las comprueba el servidor.
  return <span className={styles.statusDone}>Listo para enviar</span>;
}

export function BulkImport({ session, subcategorySuggestions }: Props) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<{ version: number; rows: ImportDraft[]; session: ImportedSession | null } | null>(null);
  const version = useRef(0);
  const [message, setMessage] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [problem, setProblem] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const instructions = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (message !== '') noticeRef.current?.focus();
  }, [message]);

  const preview = () => {
    try {
      const parsed = parseImportedBatch(text);
      version.current += 1;
      setBatch({ version: version.current, rows: parsed.errors, session: parsed.session });
      setProblem('');
      setMessage('');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'No se pudo leer el texto.');
    }
  };

  return (
    <div className={styles.bulk}>
      {batch === null ? (
        <>
          <p>Pega varios errores, revísalos y guárdalos juntos en esta sesión.</p>
          <label className={styles.paste}>
            Errores para importar
            <textarea value={text} onChange={(event) => { setText(event.target.value); setProblem(''); }} rows={8} placeholder="Pega aqui el bloque de la IA o las celdas de tu tabla…" />
          </label>
          <button type="button" className={ui.primary} onClick={preview}>Preparar vista previa</button>
          <details className={styles.instructions}>
            <summary>Convertir mis correcciones con IA</summary>
            <ol>
              <li>Copia estas instrucciones en la IA que uses. Pega tus correcciones o adjunta fotos y capturas si esa IA admite imágenes.</li>
              <li>En las fotos, incluye el ejercicio, tu respuesta y la corrección o el solucionario. Usa imágenes de la misma sesión y amplíalas si el texto se ve pequeño.</li>
              <li>Copia el bloque que te devuelva y pégalo en «Errores para importar».</li>
              <li>Revisa la vista previa, completa los datos que no se hayan podido leer y guarda la tanda.</li>
            </ol>
            <button type="button" className={ui.secondary} onClick={() => {
              const selectInstructions = () => {
                instructions.current?.focus();
                instructions.current?.select();
                setCopyMessage('Seleccionadas: pulsa Ctrl+C para copiarlas.');
              };
              // La API de portapapeles solo existe en contexto seguro: abrir la app por http
              // desde otro equipo hace que leerla lance antes de que haya promesa que fallar.
              try {
                void navigator.clipboard.writeText(IMPORT_PROMPT).then(
                  () => { setCopyMessage('Instrucciones copiadas. Pégalas junto a tus correcciones.'); },
                  selectInstructions,
                );
              } catch {
                selectInstructions();
              }
            }}>Copiar instrucciones para la IA</button>
            <p role="status">{copyMessage}</p>
            <textarea ref={instructions} aria-label="Instrucciones para la IA" value={IMPORT_PROMPT} readOnly rows={5} />
            <p>Las fotos se adjuntan en la IA que uses. Aquí pegas el bloque que te devuelva; la app todavía no lee imágenes directamente.</p>
          </details>
          <details className={styles.instructions}>
            <summary>Pegar desde una hoja de cálculo</summary>
            <p>Copia las celdas con sus cabeceras: Ítem, Enunciado, Mi respuesta, Correcta, Categoría y Regla. Puedes añadir Causa, Confianza y Subcategoría.</p>
            <textarea aria-label="Plantilla para hoja de calculo" readOnly value={IMPORT_TEMPLATE} rows={3} onFocus={(event) => { event.target.select(); }} />
          </details>
        </>
      ) : (
        <ImportReview key={batch.version} {...{ session, subcategorySuggestions }} drafts={batch.rows} envelopeSession={batch.session ?? undefined}
          onBack={() => { setBatch(null); }}
          onSaved={(savedMessage) => {
            setMessage(savedMessage);
            setText('');
            setBatch(null);
          }} />
      )}
      {problem !== '' && <p role="alert" className={ui.fieldError}>{problem}</p>}
      {message !== '' && <p ref={noticeRef} tabIndex={-1} role="status" className={ui.noticeOk}>{message}</p>}
    </div>
  );
}

export function ImportReview({ session, subcategorySuggestions, drafts, onBack, onSaved, proposal, envelopeSession, today = '', openSessions = [] }: Omit<Props, 'session'> & {
  readonly session: SessionRow | null;
  readonly proposal?: ImportedSession;
  readonly envelopeSession?: ImportedSession;
  readonly today?: string;
  readonly openSessions?: readonly SessionRow[];
  readonly drafts: readonly ImportDraft[];
  readonly onBack: () => void;
  readonly onSaved: (message: string, createdId?: number) => void;
}) {
  const [targetId, setTargetId] = useState('new');
  const target = session ?? openSessions.find((row) => String(row.id) === targetId) ?? null;
  const [timed, setTimed] = useState(proposal?.timed ?? false);
  const [rows, setRows] = useState(() => drafts.map((draft, id) => ({ id, draft })));
  const [snapshots, setSnapshots] = useState<ReadonlyMap<number, RowSnapshot>>(
    () => new Map(drafts.map((draft, id) => [id, snapshotFromDraft(draft)])),
  );
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const [openRows, setOpenRows] = useState<ReadonlySet<number>>(new Set());
  const [blocked, setBlocked] = useState(false);
  const incompleteRows = rows.filter(({ id }) => missingFields(snapshots.get(id) ?? EMPTY_SNAPSHOT).length > 0);
  // El aviso de envio bloqueado se deriva: sin filas incompletas no hay nada que avisar.
  const showBlocked = blocked && incompleteRows.length > 0;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastFocusedRow = useRef<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: number | null; field: string } | null>(null);
  const handledFocus = useRef<typeof focusRequest>(null);
  // La accion devuelve los errores por posicion en la tanda enviada. Guardamos que fila
  // ocupaba cada posicion para que quitar una despues no desplace los mensajes.
  const [sentIds, setSentIds] = useState<readonly number[]>([]);
  const [state, action, pending] = useActionState(async (previous: typeof EMPTY_STATE, payload: FormData) => {
    try {
      const result = await (target === null ? importSessionAction : importErrorsAction)(previous, payload);
      if (result.ok) onSaved(result.message ?? 'Tanda guardada.', result.createdId ?? target?.id);
      return result;
    } catch {
      return { ok: false, fieldErrors: {}, message: 'No se pudo conectar. Conservamos la tanda; vuelve a intentarlo.' };
    }
  }, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();

  useEffect(() => { headingRef.current?.focus(); }, []);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) askRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  useEffect(() => {
    if (focusRequest === null || handledFocus.current === focusRequest) return;
    handledFocus.current = focusRequest;
    const element = focusRequest.id === null ? headingRef.current
      : formRef.current?.elements.namedItem(`${String(focusRequest.id)}.${focusRequest.field}`);
    if (element instanceof HTMLElement) {
      element.focus();
      element.scrollIntoView({ block: 'center' });
    }
  }, [focusRequest, formRef]);

  useEffect(() => {
    if (!state.ok && Object.keys(state.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state, formRef]);

  const rowIdFor = (element: EventTarget | null): number | null => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return null;
    const match = /^(\d+)\./.exec(element.name);
    return match === null ? null : Number(match[1]);
  };

  const refresh = (event: FormEvent<HTMLFormElement>) => {
    // En un select, input precede a change: renderizar aqui restauraria su valor
    // controlado antes de que onChange reciba la seleccion hecha con el teclado.
    if (event.type === 'input' && event.target instanceof HTMLSelectElement) return;
    const id = rowIdFor(event.target);
    if (id !== null && formRef.current !== null) {
      const snapshot = readRow(new FormData(formRef.current), id);
      setSnapshots((current) => new Map(current).set(id, snapshot));
    }
    setDirty(true);
    // Tras editar, el contador vuelve a mandar; el aviso reaparece si se intenta guardar.
    setBlocked(false);
  };

  const goToNextPending = () => {
    // Al pulsar la barra, el boton ya tiene el foco: conservamos la ultima fila visitada.
    const currentId = rowIdFor(document.activeElement) ?? lastFocusedRow.current;
    const currentIndex = rows.findIndex(({ id }) => id === currentId);
    const next = incompleteRows.find((row) => rows.indexOf(row) > currentIndex) ?? incompleteRows[0];
    if (next === undefined) return;
    const field = missingFields(snapshots.get(next.id) ?? EMPTY_SNAPSHOT)[0];
    if (field === undefined) return;
    if (field === 'prompt') setOpenRows((current) => new Set([...current, next.id]));
    setFocusRequest({ id: next.id, field });
  };

  return (
    <form ref={formRef} noValidate onReset={onReset} onInput={refresh} onChange={refresh}
      onFocusCapture={(event) => {
        const id = rowIdFor(event.target);
        if (id !== null) lastFocusedRow.current = id;
      }} action={(form) => {
      if (incompleteRows.length > 0) { setBlocked(true); goToNextPending(); return; }
      setBlocked(false);
      const sent = rows.map((row) => row.id);
      setSentIds(sent);
      action(buildImportPayload(form, sent, { targetId: target?.id ?? null, importedHeader: proposal ?? envelopeSession }));
    }}>
      <h3 ref={headingRef} tabIndex={-1}>Revisar {rows.length} {rows.length === 1 ? 'error' : 'errores'}</h3>
      {rows.length === 0 ? <p className={ui.hint}>Esta tanda no contiene errores. La sesión contará igualmente en los informes.</p>
        : <p className={ui.hint}>Comprueba las correcciones y la regla. Si no venían causa y confianza, proponemos Desconocimiento y Dudaba: cámbialas si no reflejan lo que te pasó.</p>}
      {envelopeSession !== undefined && <p className={ui.hint}>Se añaden los errores a esta sesión. La cabecera del bloque no sustituye la actual ni se suman sus recuentos.</p>}
      {proposal !== undefined && <>
        {openSessions.length > 0 && <label className={styles.paste}>
          Destino de la tanda
          <select value={targetId} disabled={pending} onChange={(event) => setTargetId(event.target.value)}>
            <option value="new">Crear sesión con esta tanda</option>
            {openSessions.map((row) => <option key={row.id} value={row.id}>
              Añadir a #{row.id} · {row.date} · {row.sourceRef || 'Sin referencia'} · {KIND_LABELS[row.kind]}
            </option>)}
          </select>
        </label>}
        {target !== null && <p role="status">Se conserva la cabecera de la sesión #{target.id}: {target.itemsCorrect ?? '—'}/{target.itemsTotal ?? '—'} aciertos/ítems.
          Los recuentos del bloque no se suman automáticamente. Puedes corregirlos en la cabecera de esa sesión.</p>}
        <fieldset hidden={target !== null} disabled={pending || target !== null} className={styles.row}>
          <legend>Cabecera propuesta</legend>
          <p className={ui.hint}>Una sesión es toda esta tanda de estudio. Revisa la cabecera; si has cronometrado, escribe los minutos.</p>
          <div className={`${headerStyles.form} ${styles.headerFields}`}>
            <SessionFields today={today} defaults={proposal} onTimedChange={setTimed}
              fieldErrors={Object.fromEntries(Object.entries(state.fieldErrors).filter(([key]) => key.startsWith('session.')).map(([key, value]) => [key.slice(8), value]))} />
          </div>
        </fieldset>
      </>}
      {rows.map(({ id, draft }, index) => {
        const snapshot = snapshots.get(id) ?? EMPTY_SNAPSHOT;
        const missing = missingFields(snapshot);
        const rowErrors = errorsForRow(state.fieldErrors, sentIds.indexOf(id));
        return (
        <fieldset key={id} disabled={pending} className={styles.row}>
          <legend>Error {index + 1}</legend>
          <div className={styles.rowHead}>
            <RowStatus missing={missing} rejected={Object.keys(rowErrors).length > 0} />
            <button type="button" className={`${ui.secondary} ${ui.small}`} onClick={() => {
              setRows((current) => current.filter((row) => row.id !== id));
              setDirty(true);
              setFocusRequest({ id: rows[index + 1]?.id ?? null, field: 'correctAnswer' });
            }}>Quitar error {index + 1} de la tanda</button>
          </div>
          <p className={styles.rowSummary}>
            {snapshot.itemRef && <><span className="data">ítem {snapshot.itemRef}</span>{' · '}</>}
            {snapshot.prompt.trim() === '' ? <em>sin enunciado</em> : snapshot.prompt}
            {snapshot.myAnswer && <>{' · '}<span>tu respuesta: <s className="data">{snapshot.myAnswer}</s></span></>}
          </p>
          <ErrorFields compact detailsOpen={openRows.has(id) || missing.includes('prompt')}
            onDetailsToggle={(open) => setOpenRows((current) => {
              const next = new Set(current);
              if (open) next.add(id); else next.delete(id);
              return next;
            })}
            timed={target?.timed ?? timed} subcategorySuggestions={subcategorySuggestions}
            defaults={draft} namePrefix={`${String(id)}.`} fieldErrors={rowErrors} />
        </fieldset>
      ); })}
      <p className={ui.hint}>Los errores ya registrados en esta sesión se omiten si coinciden ítem, enunciado y respuestas. Puedes editarlos en el listado.</p>
      {state.message !== null && !state.ok && <p role="alert" className={ui.fieldError}>{state.message}</p>}
      <div className={styles.bar} onKeyDown={(event) => {
        if (event.key === 'Escape' && confirming) setConfirming(false);
      }}>
        <p className={`${styles.barStatus}${showBlocked ? ` ${ui.fieldError}` : ''}`} aria-live="polite">
          {showBlocked ? `Completa los errores pendientes antes de guardar. Faltan ${String(incompleteRows.length)} de ${String(rows.length)}.`
            : incompleteRows.length === 0
              ? rows.length === 0 ? '' : `${rows.length === 1 ? 'El error está completo' : `Los ${String(rows.length)} errores están completos`}.`
              : `Faltan ${String(incompleteRows.length)} de ${String(rows.length)} por completar.`}
        </p>
        {incompleteRows.length > 0 && <button type="button" className={`${ui.secondary} ${ui.small}`} onClick={goToNextPending}>
          Ir al siguiente pendiente
        </button>}
        <button type="submit" className={ui.primary} disabled={pending || (target !== null && rows.length === 0)} aria-busy={pending}>
          {pending ? 'Guardando…' : target === null ? `Crear sesión y guardar ${String(rows.length)} ${rows.length === 1 ? 'error' : 'errores'}` : `Guardar ${String(rows.length)} ${rows.length === 1 ? 'error' : 'errores'}`}
        </button>
        {confirming ? <>
          <span className={ui.note}>Se descartan los cambios de la vista previa; el texto pegado se conserva.</span>
          <button type="button" className={`${ui.danger} ${ui.small}`} disabled={pending} onClick={onBack}>Descartar y volver</button>
          <button ref={keepRef} type="button" className={`${ui.secondary} ${ui.small}`} onClick={() => { setConfirming(false); }}>Seguir revisando</button>
        </> : <button ref={askRef} type="button" className={ui.secondary} disabled={pending} onClick={() => {
          if (dirty) setConfirming(true); else onBack();
        }}>Volver al texto pegado</button>}
      </div>
    </form>
  );
}
