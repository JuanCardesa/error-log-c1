'use client';

import { useActionState, useRef, useState } from 'react';

import { IMPORT_PROMPT, IMPORT_TEMPLATE, parseImportedErrors, type ImportDraft } from '@/lib/import/errors';
import type { SessionRow } from '@/lib/domain/types';
import { usePreservedForm } from '../_shared/usePreservedForm';
import { ErrorFields } from './ErrorFields';
import { EMPTY_STATE } from './formState';
import { importErrorsAction } from './importActions';
import styles from './bulk.module.css';
import capture from './capture.module.css';

interface Props {
  readonly session: SessionRow;
  readonly subcategorySuggestions: readonly string[];
}

export function BulkImport({ session, subcategorySuggestions }: Props) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<{ version: number; rows: ImportDraft[] } | null>(null);
  const version = useRef(0);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const instructions = useRef<HTMLTextAreaElement>(null);

  const preview = () => {
    try {
      const rows = parseImportedErrors(text);
      version.current += 1;
      setBatch({ version: version.current, rows });
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
          void navigator.clipboard.writeText(IMPORT_PROMPT).then(
            () => { setCopyMessage('Instrucciones copiadas. Pegalas junto a tus correcciones.'); },
            () => {
              instructions.current?.focus();
              instructions.current?.select();
              setCopyMessage('Seleccionadas: pulsa Ctrl+C para copiarlas.');
            },
          );
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
        <ImportReview key={batch.version} {...{ session, subcategorySuggestions }} drafts={batch.rows}
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

function ImportReview({ session, subcategorySuggestions, drafts, onBack, onSaved }: Props & {
  readonly drafts: readonly ImportDraft[];
  readonly onBack: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState(() => drafts.map((draft, id) => ({ id, draft })));
  const [state, action, pending] = useActionState(async (previous: typeof EMPTY_STATE, payload: FormData) => {
    try {
      const result = await importErrorsAction(previous, payload);
      if (result.ok) onSaved(result.message ?? 'Tanda guardada.');
      return result;
    } catch {
      return { ok: false, fieldErrors: {}, message: 'No se pudo conectar. Conservamos la tanda; vuelve a intentarlo.' };
    }
  }, EMPTY_STATE);
  const { formRef, onReset } = usePreservedForm();
  const [startedAt] = useState(() => Date.now());
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
      const payload = new FormData();
      payload.set('sessionId', String(session.id));
      payload.set('rows', JSON.stringify(values));
      payload.set('secs', String(Math.max(0, Math.round((Date.now() - startedAt) / 1000))));
      action(payload);
    }}>
      <h3>Revisar {rows.length} {rows.length === 1 ? 'error' : 'errores'}</h3>
      <p className={capture.hint}>Comprueba las correcciones y la regla. Si no venian causa y confianza, proponemos DESCONOCIMIENTO y DUDABA: cambialas si no reflejan lo que te paso.</p>
      {rows.map(({ id, draft }, index) => (
        <fieldset key={id} disabled={pending} className={styles.row}>
          <legend>Error {index + 1}</legend>
          <div className={`${capture.grid} ${styles.fields}`}>
            <ErrorFields variant="grid" timed={session.timed} subcategorySuggestions={subcategorySuggestions}
              defaults={draft} namePrefix={`${String(id)}.`}
              fieldErrors={Object.fromEntries(Object.entries(state.fieldErrors)
                .filter(([key]) => key.startsWith(`${String(index)}.`))
                .map(([key, value]) => [key.slice(key.indexOf('.') + 1), value]))} />
          </div>
          <button type="button" className={styles.secondary} onClick={() => {
            setRows((current) => current.filter((row) => row.id !== id));
          }}>Quitar error {index + 1} de la tanda</button>
        </fieldset>
      ))}
      {state.message !== null && !state.ok && <p role="alert" className={capture.fieldError}>{state.message}</p>}
      <div className={styles.actions}>
        <button type="submit" className={capture.primary} disabled={pending || rows.length === 0}>
          {pending ? 'Guardando…' : `Guardar ${String(rows.length)} ${rows.length === 1 ? 'error' : 'errores'}`}
        </button>
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => {
          if (window.confirm('Volver al texto descarta los cambios hechos en la vista previa. El texto pegado se conserva. ¿Continuar?')) onBack();
        }}>Volver al texto pegado</button>
      </div>
      <p className={capture.hint}>Los errores ya registrados en esta sesion se omiten si coinciden item, enunciado y respuestas. Puedes editarlos en el listado.</p>
    </form>
  );
}
