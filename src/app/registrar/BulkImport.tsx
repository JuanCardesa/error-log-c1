'use client';

import { useActionState, useRef, useState } from 'react';

import { errorsForRow, IMPORT_PROMPT, IMPORT_TEMPLATE, parseImportedBatch, type ImportDraft, type ImportedSession } from '@/lib/import/errors';
import type { SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import { importErrorsAction, importSessionAction } from './importActions';
import { SessionFields } from './SessionFields';
import headerStyles from './session.module.css';
import styles from './bulk.module.css';
import capture from './capture.module.css';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
}

export function BulkImport({ session, subcategorySuggestions }: Props) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<{ version: number; rows: ImportDraft[]; session: ImportedSession | null } | null>(null);
  const version = useRef(0);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const instructions = useRef<HTMLTextAreaElement>(null);

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
      <p>Pega varios errores, revisalos y guardalos juntos en esta sesion.</p>
      <details className={styles.instructions}>
        <summary>Convertir mis correcciones con IA</summary>
        <ol>
          <li>Copia estas instrucciones en la IA que uses. Pega tus correcciones o adjunta fotos y capturas si esa IA admite imagenes.</li>
          <li>En las fotos, incluye el ejercicio, tu respuesta y la correccion o el solucionario. Usa imagenes de la misma sesion y amplialas si el texto se ve pequeño.</li>
          <li>Copia el bloque que te devuelva y pegalo en «Errores para importar».</li>
          <li>Revisa la vista previa, completa los datos que no se hayan podido leer y guarda la tanda.</li>
        </ol>
        <button type="button" className={styles.secondary} onClick={() => {
          const selectInstructions = () => {
            instructions.current?.focus();
            instructions.current?.select();
            setCopyMessage('Seleccionadas: pulsa Ctrl+C para copiarlas.');
          };
          // La API de portapapeles solo existe en contexto seguro: abrir la app por http
          // desde otro equipo hace que leerla lance antes de que haya promesa que fallar.
          try {
            void navigator.clipboard.writeText(IMPORT_PROMPT).then(
              () => { setCopyMessage('Instrucciones copiadas. Pegalas junto a tus correcciones.'); },
              selectInstructions,
            );
          } catch {
            selectInstructions();
          }
        }}>Copiar instrucciones para la IA</button>
        <p role="status">{copyMessage}</p>
        <textarea ref={instructions} aria-label="Instrucciones para la IA" value={IMPORT_PROMPT} readOnly rows={5} />
        <p>Las fotos se adjuntan en la IA que uses. Aqui pegas el bloque que te devuelva; la app todavia no lee imagenes directamente.</p>
      </details>
      <details className={styles.instructions}>
        <summary>Pegar desde una hoja de calculo</summary>
        <p>Copia las celdas con sus cabeceras: Item, Enunciado, Mi respuesta, Correcta, Categoria y Regla. Puedes añadir Causa, Confianza y Subcategoria.</p>
        <textarea aria-label="Plantilla para hoja de calculo" readOnly value={IMPORT_TEMPLATE} rows={3} onFocus={(event) => { event.target.select(); }} />
      </details>
      {batch === null ? (
        <>
          <label className={styles.paste}>
            Errores para importar
            <textarea value={text} onChange={(event) => { setText(event.target.value); setProblem(''); }} rows={8} placeholder="Pega aqui el bloque de la IA o las celdas de tu tabla…" />
          </label>
          <button type="button" className={capture.primary} onClick={preview}>Preparar vista previa</button>
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
      {problem !== '' && <p role="alert" className={capture.fieldError}>{problem}</p>}
      {message !== '' && <p role="status" className={styles.success}>{message}</p>}
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
  const textFields = ['itemRef', 'prompt', 'myAnswer', 'correctAnswer', 'cause', 'category', 'subcategory', 'confidence', 'ruleNote'] as const;

  return (
    <form ref={formRef} onReset={onReset} action={(form) => {
      const values = rows.map(({ id }) => {
        const prefix = `${String(id)}.`;
        return {
          ...Object.fromEntries(textFields.map((field) => [field, form.get(`${prefix}${field}`)])),
          lateInSession: form.has(`${prefix}lateInSession`),
          ankiAdded: form.has(`${prefix}ankiAdded`),
        };
      });
      setSentIds(rows.map((row) => row.id));
      const payload = new FormData();
      if (target !== null) payload.set('sessionId', String(target.id));
      const importedHeader = proposal ?? envelopeSession;
      if (importedHeader !== undefined) {
        const number = (key: string) => form.get(key) === null || form.get(key) === '' ? null : Number(form.get(key));
        const header = target === null ? {
          date: form.get('date'), kind: form.get('kind'), paper: form.get('paper') || null,
          part: number('part'), source: form.get('source'), sourceRef: form.get('sourceRef'),
          itemsTotal: number('itemsTotal'), itemsCorrect: number('itemsCorrect'), timed: form.has('timed'),
        } : importedHeader;
        payload.set('envelope', JSON.stringify({ session: header, errors: values }));
        if (target === null) payload.set('durationMin', String(form.get('durationMin') ?? ''));
      } else payload.set('rows', JSON.stringify(values));
      action(payload);
    }}>
      {envelopeSession !== undefined && <p className={capture.hint}>Se añaden los errores a esta sesión. La cabecera del bloque no sustituye la actual ni se suman sus recuentos.</p>}
      {proposal !== undefined && <>
        {openSessions.length > 0 && <label className={styles.paste}>
          Destino de la tanda
          <select value={targetId} disabled={pending} onChange={(event) => setTargetId(event.target.value)}>
            <option value="new">Crear sesión con esta tanda</option>
            {openSessions.map((row) => <option key={row.id} value={row.id}>
              Añadir a #{row.id} · {row.date} · {row.sourceRef || 'Sin referencia'} · {row.kind}
            </option>)}
          </select>
        </label>}
        {target !== null && <p role="status">Se conserva la cabecera de la sesión #{target.id}: {target.itemsCorrect ?? '—'}/{target.itemsTotal ?? '—'} aciertos/items.
          Los recuentos del bloque no se suman automáticamente. Puedes corregirlos en la cabecera de esa sesión.</p>}
        <fieldset hidden={target !== null} disabled={pending || target !== null} className={styles.row}>
          <legend>Cabecera propuesta</legend>
          <p className={capture.hint}>Una sesión es toda esta tanda de estudio. Revisa la cabecera; si has cronometrado, escribe los minutos.</p>
          <div className={`${headerStyles.form} ${styles.headerFields}`}>
            <SessionFields today={today} defaults={proposal} onTimedChange={setTimed}
              fieldErrors={Object.fromEntries(Object.entries(state.fieldErrors).filter(([key]) => key.startsWith('session.')).map(([key, value]) => [key.slice(8), value]))} />
          </div>
        </fieldset>
      </>}
      <h3>Revisar {rows.length} {rows.length === 1 ? 'error' : 'errores'}</h3>
      {rows.length === 0 ? <p className={capture.hint}>Esta tanda no contiene errores. La sesión contará igualmente en los informes.</p>
        : <p className={capture.hint}>Comprueba las correcciones y la regla. Si no venian causa y confianza, proponemos DESCONOCIMIENTO y DUDABA: cambialas si no reflejan lo que te paso.</p>}
      {rows.map(({ id, draft }, index) => (
        <fieldset key={id} disabled={pending} className={styles.row}>
          <legend>Error {index + 1}</legend>
          <div className={`${capture.grid} ${styles.fields}`}>
            <ErrorFields timed={target?.timed ?? timed} subcategorySuggestions={subcategorySuggestions}
              defaults={draft} namePrefix={`${String(id)}.`}
              fieldErrors={errorsForRow(state.fieldErrors, sentIds.indexOf(id))} />
          </div>
          <button type="button" className={styles.secondary} onClick={() => {
            setRows((current) => current.filter((row) => row.id !== id));
          }}>Quitar error {index + 1} de la tanda</button>
        </fieldset>
      ))}
      {state.message !== null && !state.ok && <p role="alert" className={capture.fieldError}>{state.message}</p>}
      <div className={styles.actions}>
        <button type="submit" className={capture.primary} disabled={pending || (target !== null && rows.length === 0)}>
          {pending ? 'Guardando…' : target === null ? `Crear sesión y guardar ${String(rows.length)} ${rows.length === 1 ? 'error' : 'errores'}` : `Guardar ${String(rows.length)} ${rows.length === 1 ? 'error' : 'errores'}`}
        </button>
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => {
          if (window.confirm('Volver al texto descarta los cambios hechos en la vista previa. El texto pegado se conserva. ¿Continuar?')) onBack();
        }}>Volver al texto pegado</button>
      </div>
      <p className={capture.hint}>Los errores ya registrados en esta sesion se omiten si coinciden item, enunciado y respuestas. Puedes editarlos en el listado.</p>
    </form>
  );
}
