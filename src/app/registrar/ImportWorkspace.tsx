'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleDashed, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';

import { CAUSES, CAUSE_META, CONFIDENCES, type Cause } from '@/lib/domain/enums';
import type { SessionRow } from '@/lib/domain/types';
import { errorsForRow } from '@/lib/import/errors';
import { RULE_NOTE_MIN_LENGTH } from '@/lib/validation/schemas';
import { CategoryCombobox } from '../_shared/CategoryCombobox';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { mediumDate, practiceLongLabel, sessionTitle } from '../_shared/format';
import { Kbd } from '../_shared/Kbd';
import { CAUSE_LABELS, CONFIDENCE_LABELS, SOURCE_LABELS } from '../_shared/labels';
import { useShortcutLabels } from '../_shared/shortcuts';
import { useToast } from '../_shared/Toast';
import { EMPTY_STATE } from './formState';
import { importErrorsAction, importSessionAction } from './importActions';
import { buildImportPayload, type DraftRow, type MissingField, missingFields, nextPendingIndex, snapshotFromDraft } from './reviewRows';
import { SessionFields } from './SessionFields';
import { type HeaderDraft, type TandaDraft, clearDraft, readHeaderForm, toImportedSession, writeDraft } from './tandaDraft';
import styles from './workspace.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Revisión de una tanda: un índice compacto con el estado de cada error y un solo editor
 * para el seleccionado. Sirve igual para 3 errores que para 300.
 *
 * El borrador vive en el estado por id de fila, no en los campos montados: el editor
 * enseña una fila cada vez y el envío sale de ese estado con el mismo contrato de
 * siempre. Se guarda también en este navegador hasta que el servidor confirma.
 *
 * El guardado es atómico en el servidor. Si la respuesta no llega, no se sabe si se
 * guardó: se dice así y se ofrece comprobarlo antes de repetir.
 */

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'rejected'; readonly message: string; readonly byRow: ReadonlyMap<number, Record<string, string[]>>; readonly header: Record<string, string[]> };

const FIELD_ID: Readonly<Record<MissingField, string>> = {
  correctAnswer: 'correct',
  category: 'category',
  ruleNote: 'rule',
  prompt: 'prompt',
};

const isCause = (value: string): value is Cause => (CAUSES as readonly string[]).includes(value);

export function ImportWorkspace({ initial, today, openSessions, fixedTarget, subcategorySuggestions, onBack, onSaved }: {
  readonly initial: TandaDraft;
  readonly today: string;
  readonly openSessions: readonly SessionRow[];
  readonly fixedTarget: SessionRow | null;
  readonly subcategorySuggestions: readonly string[];
  readonly onBack: () => void;
  readonly onSaved: (message: string, sessionId: number, created: boolean) => void;
}) {
  const scope = useId();
  const keys = useShortcutLabels();
  const toast = useToast();

  const [rows, setRows] = useState<readonly DraftRow[]>(initial.rows);
  const [selectedId, setSelectedId] = useState<number | null>(initial.selectedId ?? initial.rows[0]?.id ?? null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(fixedTarget?.id ?? initial.targetId);
  const [header, setHeader] = useState<HeaderDraft>(initial.header);
  const headerIncomplete = header.paper !== 'WRITING' && (header.itemsTotal === null || header.itemsCorrect === null);
  const [headerOpen, setHeaderOpen] = useState(fixedTarget === null && initial.targetId === null && headerIncomplete);
  const [changingTarget, setChangingTarget] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: number; field: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headerForm = useRef<HTMLFormElement>(null);
  const finished = useRef(false);
  const importId = useRef(initial.importId ?? crypto.randomUUID());

  const target = fixedTarget ?? openSessions.find((session) => session.id === targetId) ?? null;
  const timed = target?.timed ?? header.timed;

  const pending = useMemo(
    () => new Set(rows.filter((row) => missingFields(snapshotFromDraft(row)).length > 0).map((row) => row.id)),
    [rows],
  );
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const current = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
  const visible = onlyPending ? rows.filter((row) => pending.has(row.id) || row.id === selectedId) : rows;
  const blocked = pending.size > 0 || saving || (target !== null && rows.length === 0);

  useEffect(() => { headingRef.current?.focus(); }, []);

  // El borrador se copia en el navegador mientras dura la revisión.
  const persist = useCallback(() => {
    if (finished.current) return;
    writeDraft({
      importId: importId.current,
      targetId: fixedTarget?.id ?? targetId,
      header,
      importedHeader: initial.importedHeader,
      rows,
      selectedId,
    });
  }, [rows, header, targetId, selectedId, fixedTarget, initial.importedHeader]);
  useEffect(() => {
    const timer = setTimeout(persist, 300);
    return () => { clearTimeout(timer); };
  }, [persist]);

  useEffect(() => {
    if (focusRequest === null) return;
    const element = document.getElementById(`${scope}-${focusRequest.field}`);
    if (element !== null) {
      element.focus();
      element.scrollIntoView({ block: 'center' });
    }
  }, [focusRequest, scope]);

  const select = (id: number) => { setSelectedId(id); };

  const goToPending = (fromIndex: number) => {
    const next = nextPendingIndex(rows, fromIndex);
    if (next === null) return;
    const row = rows[next];
    if (row === undefined) return;
    const field = missingFields(snapshotFromDraft(row))[0];
    setSelectedId(row.id);
    setFocusRequest({ id: row.id, field: field === undefined ? 'correct' : FIELD_ID[field] });
  };

  const update = (id: number, patch: Partial<DraftRow>) => {
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const remove = (id: number) => {
    const index = rows.findIndex((row) => row.id === id);
    const removed = rows[index];
    if (removed === undefined) return;
    const next = rows[index + 1] ?? rows[index - 1];
    setRows((list) => list.filter((row) => row.id !== id));
    setSelectedId(next?.id ?? null);
    setDirty(true);
    toast({
      message: `Error ${String(index + 1)} quitado de la tanda`,
      undo: () => {
        setRows((list) => {
          if (list.some((row) => row.id === removed.id)) return list;
          const copy = [...list];
          copy.splice(Math.min(index, copy.length), 0, removed);
          return copy;
        });
        setSelectedId(removed.id);
      },
    });
  };

  const submit = () => {
    if (saving) return;
    if (pending.size > 0) {
      goToPending(selectedIndex);
      toast({ message: `Completa ${pending.size === 1 ? 'el pendiente' : `los ${String(pending.size)} pendientes`} para guardar`, tone: 'error' });
      return;
    }
    if (target !== null && rows.length === 0) {
      toast({ message: 'Esta tanda no tiene errores que añadir a la sesión.', tone: 'error' });
      return;
    }
    if (target === null && headerIncomplete) {
      setHeaderOpen(true);
      toast({ message: 'Completa los ítems y aciertos de la sesión antes de guardar.', tone: 'error' });
      return;
    }
    // Sin esperar al guardado diferido: si la respuesta no llega, el borrador ya está.
    persist();
    const sent = rows.map((row) => row.id);
    const payload = buildImportPayload(rows, {
      targetId: target?.id ?? null,
      header: target === null ? toImportedSession(header) : initial.importedHeader ?? undefined,
      durationMin: header.durationMin,
      importId: importId.current,
    });
    startSaving(async () => {
      let result: typeof EMPTY_STATE;
      try {
        result = await (target === null ? importSessionAction : importErrorsAction)(EMPTY_STATE, payload);
      } catch {
        setSave({ kind: 'uncertain' });
        return;
      }
      const createdId = result.createdId ?? target?.id;
      if (result.ok && createdId !== undefined) {
        finished.current = true;
        clearDraft();
        onSaved(result.message ?? 'Tanda guardada.', createdId, target === null);
        return;
      }
      const byRow = new Map<number, Record<string, string[]>>();
      sent.forEach((id, position) => {
        const found = errorsForRow(result.fieldErrors, position);
        if (Object.keys(found).length > 0) byRow.set(id, found);
      });
      const headerErrors = Object.fromEntries(
        Object.entries(result.fieldErrors).filter(([key]) => key.startsWith('session.')).map(([key, value]) => [key.slice(8), value]),
      );
      setSave({ kind: 'rejected', message: result.message ?? 'Revisa los campos señalados.', byRow, header: headerErrors });
      if (Object.keys(headerErrors).length > 0) setHeaderOpen(true);
      const firstRejected = sent.find((id) => byRow.has(id));
      if (firstRejected !== undefined) setSelectedId(firstRejected);
    });
  };

  // Atajos de la revisión, también dentro de los campos.
  const submitRef = useRef(submit);
  const pendingRef = useRef(() => { goToPending(selectedIndex); });
  const removeRef = useRef(() => { if (current !== undefined) remove(current.id); });
  useEffect(() => {
    submitRef.current = submit;
    pendingRef.current = () => { goToPending(selectedIndex); };
    removeRef.current = () => { if (current !== undefined) remove(current.id); };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') !== null) return;
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        pendingRef.current();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        submitRef.current();
      } else if (event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        removeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, []);

  const back = () => {
    if (dirty) setConfirmBack(true);
    else {
      finished.current = true;
      clearDraft();
      onBack();
    }
  };

  const destLabel = target === null ? 'sesión nueva' : `${sessionTitle(target)} · abierta`;
  const canChangeTarget = fixedTarget === null && openSessions.length > 0;
  const summary = target === null ? header : target;
  const done = rows.length - pending.size;
  const rejectedFor = (id: number) => (save.kind === 'rejected' ? save.byRow.get(id) ?? {} : {});
  const saveLabel = saving ? 'Guardando…'
    : target === null
      ? rows.length === 0 ? 'Crear sesión sin errores' : `Crear sesión y guardar ${plural(rows.length)}`
      : `Guardar ${plural(rows.length)} en esta sesión`;

  return (
    <section className={styles.workspace} aria-labelledby={`${scope}-title`}>
      <div className={styles.top}>
        <div>
          <button type="button" className={`${ui.backLink} ${styles.back}`} onClick={back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Volver al texto pegado
          </button>
          <h1 id={`${scope}-title`} ref={headingRef} tabIndex={-1} className={ui.pageTitle}>Revisar importación</h1>
        </div>
        <div className={styles.dest}>
          <span>Destino: <strong>{destLabel}</strong></span>
          {canChangeTarget && (
            <button type="button" className={ui.textLink} aria-expanded={changingTarget} onClick={() => { setChangingTarget(!changingTarget); }}>
              Cambiar destino
            </button>
          )}
        </div>
      </div>

      {changingTarget && canChangeTarget && (
        <div className={`${ui.field} ${styles.destSelect}`}>
          <label htmlFor={`${scope}-dest`}>Destino de la tanda</label>
          <select id={`${scope}-dest`}
            className={ui.select}
            value={targetId === null ? 'new' : String(targetId)}
            onChange={(event) => {
              const value = event.target.value;
              setTargetId(value === 'new' ? null : Number(value));
              setDirty(true);
            }}
          >
            <option value="new">Crear una sesión nueva con esta tanda</option>
            {openSessions.map((session) => (
              <option key={session.id} value={session.id}>
                Añadir a {sessionTitle(session)} · {mediumDate(session.date)} · abierta
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={`${ui.surface} ${styles.summary}`}>
        <span className={styles.summaryRef}>{sessionTitle(summary)}</span>
        <span className={ui.help}>{mediumDate(summary.date)}</span>
        <span className={ui.help}>{practiceLongLabel(summary)}</span>
        <span className={ui.help}>{SOURCE_LABELS[summary.source]}</span>
        <span className="num">
          {summary.paper === 'WRITING' ? 'Writing, sin ítems'
            : `${summary.itemsCorrect === null ? '—' : String(summary.itemsCorrect)} / ${summary.itemsTotal === null ? '—' : String(summary.itemsTotal)} aciertos${target !== null ? ' · no cambian' : ''}`}
        </span>
        {target === null && (
          <button type="button" className={`${ui.ghost} ${ui.compact} ${styles.summaryEdit}`} aria-expanded={headerOpen} onClick={() => { setHeaderOpen(!headerOpen); }}>
            {headerOpen ? 'Cerrar datos de la sesión' : 'Editar sesión'}
          </button>
        )}
      </div>
      {target !== null && initial.importedHeader !== null && (
        <p className={ui.helpInfo}>El bloque traía cabecera: no sustituye ni suma los recuentos de «{sessionTitle(target)}».</p>
      )}
      {target === null && headerIncomplete && !headerOpen && (
        <p className={ui.helpWarn}>Faltan los ítems y aciertos de la sesión. Complétalos en «Editar sesión».</p>
      )}

      {/* Montado aunque esté cerrado: lo escrito en la cabecera no se pierde. */}
      <section className={`${ui.surface} ${styles.headerEditor}`} hidden={target !== null || !headerOpen} aria-label="Datos de la sesión nueva">
        <form
          ref={headerForm}
          onSubmit={(event) => { event.preventDefault(); }}
          onChange={() => {
            if (headerForm.current !== null) setHeader(readHeaderForm(headerForm.current, header));
            setDirty(true);
          }}
        >
          <SessionFields
            today={today}
            defaults={header}
            fieldErrors={save.kind === 'rejected' ? save.header : {}}
            onTimedChange={() => undefined}
          />
        </form>
      </section>

      <div className={styles.progress}>
        <div className={styles.segments} aria-hidden="true">
          {rows.map((row) => (
            <span
              key={row.id}
              className={`${styles.segment} ${pending.has(row.id) ? styles.segPending : styles.segDone} ${row.id === selectedId ? styles.segActive : ''}`}
              onClick={() => { select(row.id); }}
            />
          ))}
        </div>
        <span className={styles.progressText}>
          <span className={ui.ok}>{done}</span> / {rows.length} completos
        </span>
      </div>

      <div className={`${ui.surface} ${styles.grid}`}>
        <div className={styles.index}>
          <div className={styles.indexHead}>
            <span className={styles.indexCount}>{plural(rows.length)}</span>
            <div className={ui.pills} role="group" aria-label="Filtrar la lista">
              <button type="button" className={`${ui.pill} ${styles.smallPill}`} aria-pressed={!onlyPending} onClick={() => { setOnlyPending(false); }}>Todos</button>
              <button type="button" className={`${ui.pill} ${styles.smallPill}`} aria-pressed={onlyPending} onClick={() => { setOnlyPending(true); }}>Pendientes · {pending.size}</button>
            </div>
          </div>
          <ul className={styles.indexList} aria-label="Errores de la tanda">
            {visible.map((row) => {
              const position = rows.indexOf(row);
              const isPending = pending.has(row.id);
              const rejected = Object.keys(rejectedFor(row.id)).length > 0;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`${styles.indexRow} ${row.id === selectedId ? styles.indexActive : ''}`}
                    aria-current={row.id === selectedId || undefined}
                    onClick={() => { select(row.id); }}
                  >
                    <span className={styles.indexN}>{position + 1}</span>
                    <span className={styles.indexCorrect}>{row.correctAnswer.trim() === '' ? '—' : row.correctAnswer}</span>
                    {rejected ? (
                      <span className={`${styles.indexState} ${ui.dangerText}`}><CircleAlert size={14} aria-hidden="true" />Revisar</span>
                    ) : isPending ? (
                      <span className={`${styles.indexState} ${ui.warn}`}><CircleDashed size={14} aria-hidden="true" />Falta</span>
                    ) : (
                      <span className={`${styles.indexState} ${ui.ok}`}><CircleCheck size={14} aria-hidden="true" />Listo</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.editorPane}>
          {rows.length > 1 && (
            <div className={`${ui.field} ${styles.mobilePicker}`}>
              <label htmlFor={`${scope}-picker`} className="sr-only">Error de la tanda</label>
              <select id={`${scope}-picker`} className={ui.select} value={selectedId ?? ''} onChange={(event) => { select(Number(event.target.value)); }}>
                {rows.map((row, index) => (
                  <option key={row.id} value={row.id}>
                    Error {index + 1} de {rows.length}{pending.has(row.id) ? ' · falta' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {current === undefined ? (
            <p className={styles.noRows}>
              {rows.length === 0
                ? target === null
                  ? 'Esta tanda no contiene errores. La sesión contará igualmente en tus estadísticas.'
                  : 'No quedan errores que añadir a esta sesión.'
                : 'Elige un error de la lista.'}
            </p>
          ) : (
            <RowEditor
              key={current.id}
              scope={scope}
              row={current}
              position={selectedIndex}
              total={rows.length}
              timed={timed}
              subcategorySuggestions={subcategorySuggestions}
              errors={rejectedFor(current.id)}
              removeKey={keys.remove}
              onChange={(patch) => { update(current.id, patch); }}
              onPrev={() => { const prev = rows[selectedIndex - 1]; if (prev !== undefined) select(prev.id); }}
              onNext={() => { const next = rows[selectedIndex + 1]; if (next !== undefined) select(next.id); }}
              onRemove={() => { remove(current.id); }}
            />
          )}
        </div>
      </div>

      {save.kind === 'uncertain' && (
        <div role="alert" className={ui.alert}>
          <CircleAlert size={20} className={ui.alertIcon} aria-hidden="true" />
          <div className={styles.alertText}>
            <strong>No pudimos confirmar el guardado</strong>
            <span className={ui.help}>
              Puede que la sesión se haya creado. Reintentar recuperará esa misma sesión si el guardado llegó al servidor. Tu borrador se conserva.
            </span>
          </div>
          <Link href="/registrar" className={ui.secondary}>Consultar sesiones</Link>
          <button type="button" className={ui.ghost} onClick={submit}>Reintentar</button>
        </div>
      )}
      {save.kind === 'rejected' && (
        <div role="alert" className={ui.alert}>
          <CircleAlert size={20} className={ui.alertIcon} aria-hidden="true" />
          <div className={styles.alertText}>
            <strong>No se pudo guardar esta revisión</strong>
            <span className={ui.help}>{save.message}</span>
          </div>
        </div>
      )}

      <div className={styles.bar}>
        <span id={`${scope}-pending`} className={`${styles.barText} ${pending.size > 0 ? ui.warn : ui.ok}`}>
          {pending.size > 0
            ? `${String(pending.size)} por completar · no se guarda nada hasta completarlos`
            : rows.length === 0 ? 'Tanda sin errores' : `${plural(rows.length)} ${rows.length === 1 ? 'listo' : 'listos'} para enviar`}
        </span>
        <span className={ui.spacer} />
        {pending.size > 0 && (
          <button type="button" className={ui.secondary} onClick={() => { goToPending(selectedIndex); }}>
            Siguiente pendiente <Kbd>{keys.nextPending}</Kbd>
          </button>
        )}
        <button
          type="button"
          className={ui.primary}
          aria-disabled={blocked}
          aria-busy={saving}
          aria-describedby={`${scope}-pending`}
          onClick={submit}
        >
          {saveLabel} <Kbd onPrimary>{keys.save}</Kbd>
        </button>
      </div>

      <ConfirmDialog
        open={confirmBack}
        title="Descartar la revisión"
        confirmLabel="Descartar cambios"
        pendingLabel="Descartando…"
        aside="El texto pegado se conserva."
        onCancel={() => { setConfirmBack(false); }}
        onConfirm={() => {
          finished.current = true;
          clearDraft();
          setConfirmBack(false);
          onBack();
        }}
      >
        <p>Se pierden los cambios hechos en esta revisión ({plural(rows.length)}).</p>
      </ConfirmDialog>
    </section>
  );
}

function plural(n: number): string {
  return `${String(n)} ${n === 1 ? 'error' : 'errores'}`;
}

/** El editor de la fila activa. Controlado: cada cambio va al estado de la tanda. */
function RowEditor({ scope, row, position, total, timed, subcategorySuggestions, errors, removeKey, onChange, onPrev, onNext, onRemove }: {
  readonly scope: string;
  readonly row: DraftRow;
  readonly position: number;
  readonly total: number;
  readonly timed: boolean;
  readonly subcategorySuggestions: readonly string[];
  readonly errors: Record<string, string[]>;
  readonly removeKey: string;
  readonly onChange: (patch: Partial<DraftRow>) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onRemove: () => void;
}) {
  const missing = missingFields(snapshotFromDraft(row));
  const ruleLength = row.ruleNote.trim().length;
  const cause = isCause(row.cause) ? CAUSE_META[row.cause] : null;
  const id = (field: string) => `${scope}-${field}`;
  const errorFor = (field: string) => errors[field] ?? [];
  const described = (field: string, ...extra: string[]) => {
    const ids = [...(errorFor(field).length > 0 ? [id(`${field}-error`)] : []), ...extra];
    return ids.length === 0 ? undefined : ids.join(' ');
  };
  const fieldError = (field: string) => {
    const messages = errorFor(field);
    if (messages.length === 0) return null;
    return (
      <p id={id(`${field}-error`)} className={ui.fieldError} data-field={field}>
        {messages.map((message) => <span key={message}>{message}</span>)}
      </p>
    );
  };
  const detailsOpen = missing.includes('prompt') || ['prompt', 'itemRef', 'myAnswer', 'subcategory', 'lateInSession'].some((field) => errorFor(field).length > 0);

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <h2 className={`${ui.subTitle} ${styles.editorTitle}`}>Error {position + 1} de {total}</h2>
        <div className={styles.editorNav}>
          <button type="button" className={`${ui.iconButton} ${ui.iconBordered}`} aria-label="Error anterior" onClick={onPrev} disabled={position === 0}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" className={`${ui.iconButton} ${ui.iconBordered}`} aria-label="Error siguiente" onClick={onNext} disabled={position === total - 1}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className={`${ui.ghost} ${ui.compact} ${styles.remove}`} aria-label={`Quitar error ${String(position + 1)} de la tanda`} onClick={onRemove}>
            <X size={16} aria-hidden="true" />
            Quitar <Kbd>{removeKey}</Kbd>
          </button>
        </div>
      </div>

      <div className={styles.promptBlock}>
        <span className={ui.label}>Enunciado{row.itemRef.trim() === '' ? '' : ` · ítem ${row.itemRef}`}</span>
        {row.prompt.trim() === '' ? (
          <p className={`${ui.helpWarn} ${styles.promptMissing}`}>Falta el enunciado: escríbelo en «Más detalles».</p>
        ) : (
          <p className={styles.prompt}>{row.prompt}</p>
        )}
      </div>

      <div className={styles.answers}>
        <div className={ui.field}>
          <span>Tu respuesta</span>
          {row.myAnswer.trim() === '' ? (
            <span className={`${styles.mineBox} ${styles.mineMissing}`}>Mi respuesta no registrada</span>
          ) : (
            <s className={styles.mineBox}>{row.myAnswer}</s>
          )}
        </div>
        <div className={ui.field}>
          <label htmlFor={id('correct')}>Corrección</label>
          <input
            id={id('correct')}
            className={`${ui.input} ${styles.correctInput} ${missing.includes('correctAnswer') ? ui.pending : ''}`}
            value={row.correctAnswer}
            autoComplete="off"
            onChange={(event) => { onChange({ correctAnswer: event.target.value }); }}
            aria-invalid={errorFor('correctAnswer').length > 0 || undefined}
            aria-describedby={described('correctAnswer')}
          />
          {fieldError('correctAnswer')}
        </div>
      </div>

      <div className={styles.triple}>
        <div className={ui.field}>
          <label htmlFor={id('category')}>Categoría</label>
          <CategoryCombobox
            id={id('category')}
            value={row.category}
            pending={missing.includes('category')}
            invalid={errorFor('category').length > 0}
            describedBy={described('category')}
            onChange={(category) => { onChange({ category }); }}
          />
          {fieldError('category')}
        </div>
        <div className={ui.field}>
          <label htmlFor={id('f4')}>Causa</label>
          <select id={id('f4')}
            className={ui.select}
            value={row.cause}
            onChange={(event) => { onChange({ cause: event.target.value }); }}
            aria-invalid={errorFor('cause').length > 0 || undefined}
            aria-describedby={described('cause', id('cause-help'))}
          >
            {CAUSES.map((value) => <option key={value} value={value}>{CAUSE_LABELS[value]}</option>)}
          </select>
          {fieldError('cause')}
        </div>
        <div className={ui.field}>
          <label htmlFor={id('f5')}>Confianza</label>
          <select id={id('f5')} className={ui.select} value={row.confidence} onChange={(event) => { onChange({ confidence: event.target.value }); }}>
            {CONFIDENCES.map((value) => <option key={value} value={value}>{CONFIDENCE_LABELS[value]}</option>)}
          </select>
        </div>
      </div>
      {cause !== null && (
        <span id={id('cause-help')} className={`${ui.helpInfo} ${styles.causeHelp}`}>
          {cause.meaning}. {cause.generatesCard ? 'Generará una tarjeta pendiente en Anki.' : 'No genera tarjeta.'}
        </span>
      )}

      <div className={`${ui.field} ${styles.rule}`}>
        <label htmlFor={id('rule')}>Regla</label>
        <textarea
          id={id('rule')}
          rows={3}
          className={`${ui.textarea} ${missing.includes('ruleNote') ? ui.pending : ''}`}
          value={row.ruleNote}
          placeholder="Qué debes recordar para no repetirlo"
          onChange={(event) => { onChange({ ruleNote: event.target.value }); }}
          aria-invalid={errorFor('ruleNote').length > 0 || undefined}
          aria-describedby={described('ruleNote', id('rule-count'))}
        />
        <span id={id('rule-count')} className={ruleLength >= RULE_NOTE_MIN_LENGTH ? ui.help : ui.helpWarn}>
          {ruleLength >= RULE_NOTE_MIN_LENGTH
            ? `${String(ruleLength)} caracteres`
            : `Faltan ${String(RULE_NOTE_MIN_LENGTH - ruleLength)} caracteres (mínimo ${String(RULE_NOTE_MIN_LENGTH)})`}
        </span>
        {fieldError('ruleNote')}
      </div>

      <details className={ui.disclosure} open={detailsOpen || undefined}>
        <summary>
          <ChevronRight size={14} className="chevron" aria-hidden="true" />
          Más detalles <span className={ui.optional}>· enunciado, ítem, tu respuesta, subcategoría{timed ? ', al final de la sesión' : ''}</span>
        </summary>
        <div className={styles.more}>
          <div className={ui.field}>
            <label htmlFor={id('prompt')}>Enunciado</label>
            <textarea
              id={id('prompt')}
              rows={2}
              className={`${ui.textarea} ${missing.includes('prompt') ? ui.pending : ''}`}
              value={row.prompt}
              onChange={(event) => { onChange({ prompt: event.target.value }); }}
              aria-invalid={errorFor('prompt').length > 0 || undefined}
              aria-describedby={described('prompt')}
            />
            {fieldError('prompt')}
          </div>
          <div className={styles.moreGrid}>
            <div className={ui.field}>
              <label htmlFor={id('f7')}>Ítem</label>
              <input id={id('f7')} className={ui.input} value={row.itemRef} autoComplete="off" onChange={(event) => { onChange({ itemRef: event.target.value }); }} />
            </div>
            <div className={ui.field}>
              <label htmlFor={id('f8')}>Tu respuesta</label>
              <input id={id('f8')} className={ui.input} value={row.myAnswer} autoComplete="off" onChange={(event) => { onChange({ myAnswer: event.target.value }); }} />
            </div>
            <div className={ui.field}>
              <label htmlFor={id('f9')}>Subcategoría</label>
              <input id={id('f9')}
                className={ui.input}
                value={row.subcategory}
                list={id('subcategories')}
                autoComplete="off"
                onChange={(event) => { onChange({ subcategory: event.target.value }); }}
              />
              <datalist id={id('subcategories')}>
                {subcategorySuggestions.map((value) => <option key={value} value={value} />)}
              </datalist>
            </div>
          </div>
          {timed && (
            <label className={ui.check}>
              <input type="checkbox" checked={row.lateInSession} onChange={(event) => { onChange({ lateInSession: event.target.checked }); }} />
              Al final de la sesión
            </label>
          )}
          {fieldError('subcategory')}
        </div>
      </details>
    </div>
  );
}
