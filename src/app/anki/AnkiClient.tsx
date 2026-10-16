'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { CorrectionPair } from '../_shared/CorrectionPair';
import { useT } from '../_shared/i18nClient';
import { useToast } from '../_shared/Toast';
import ui from '../_shared/ui.module.css';
import { createAnkiAction, syncAnkiAction, undoAddedAction, updateAnkiAction } from './actions';
import styles from './anki.module.css';

/**
 * Partes interactivas de Anki. Nada se da por hecho: crear, actualizar y sincronizar
 * esperan la verificación real y el aviso sale de su resultado. Los avisos viven fuera de
 * las filas, que desaparecen al revalidar.
 */

export function SyncButton() {
  const t = useT();
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      className={`${ui.secondary} ${ui.compact}`}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        start(async () => {
          try {
            const result = await syncAnkiAction();
            toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
          } catch {
            toast({ message: t.anki.syncUncertain, tone: 'error' });
          }
        });
      }}
    >
      <RefreshCw size={16} aria-hidden="true" />
      {pending ? t.anki.syncing : t.anki.sync}
    </button>
  );
}

export interface QueueEntry {
  readonly id: number;
  readonly sessionId: number;
  readonly date: string;
  readonly sessionTitle: string;
  readonly itemRef: string | null;
  readonly prompt: string;
  readonly mine: string | null;
  readonly correct: string;
  readonly rule: string;
  readonly category: string;
  readonly cause: string;
  readonly confidence: string;
}

/** Cola completa y vista previa de la seleccionada. Se crea de una en una. */
export function PendingQueue({ entries, available }: { readonly entries: readonly QueueEntry[]; readonly available: boolean }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<number | null>(entries[0]?.id ?? null);
  const [creating, start] = useTransition();
  const toast = useToast();
  const index = entries.findIndex((entry) => entry.id === selectedId);
  const current = index >= 0 ? entries[index] : entries[0];

  if (entries.length === 0) return null;

  const create = () => {
    if (!available || creating || current === undefined) return;
    const next = entries[entries.indexOf(current) + 1] ?? entries[entries.indexOf(current) - 1];
    start(async () => {
      try {
        const result = await createAnkiAction(current.id);
        if (!result.ok) {
          toast({ message: result.message, tone: 'error' });
          return;
        }
        toast({ message: t.anki.cardCreated(current.correct) });
        setSelectedId(next?.id ?? null);
      } catch {
        toast({ message: t.anki.createUncertain, tone: 'error' });
      }
    });
  };

  return (
    <div className={styles.queueLayout}>
      <div className={`${ui.scrollX} ${styles.queueTable}`}>
        <table className={`${ui.dataTable} ${ui.dataTableFixed}`}>
          <caption className="sr-only">{t.anki.queueCaption}</caption>
          <thead>
            <tr>
              <th scope="col" className={`${ui.colDate} ${styles.colDate}`}>{t.sessionForm.date}</th>
              <th scope="col">{t.correction.correction}</th>
              <th scope="col" className={styles.colCategory}>{t.errorForm.category}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const selected = entry.id === current?.id;
              return (
                <tr key={entry.id} data-clickable data-selected={selected || undefined} onClick={() => { setSelectedId(entry.id); }}>
                  <td className={`${ui.colDate} ${styles.colDate} ${styles.muted}`}>{entry.date}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.rowButton}
                      aria-current={selected || undefined}
                      onClick={(event) => { event.stopPropagation(); setSelectedId(entry.id); }}
                    >
                      {entry.correct}
                    </button>
                  </td>
                  <td className={styles.colCategory}>{entry.category}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {current !== undefined && (
        <aside className={styles.preview} aria-label={t.anki.cardPreview}>
          <span className={ui.help}>
            {current.sessionTitle} · {current.date}{current.itemRef === null ? '' : t.anki.itemSuffix(current.itemRef)}
          </span>
          <p className={styles.prompt}>{current.prompt}</p>
          <CorrectionPair mine={current.mine} correct={current.correct} variant="detail" />
          <div className={styles.rule}>
            <span className={ui.label}>{t.anki.ruleBack}</span>
            <p>{current.rule}</p>
          </div>
          <span className={ui.help}>{current.category} · {current.cause} · {current.confidence}</span>
          <div className={styles.previewActions}>
            <Link href={`/errores?error=${String(current.id)}`}>{t.anki.openError}</Link>
            <button
              type="button"
              className={ui.primary}
              aria-disabled={!available || creating}
              aria-busy={creating}
              aria-describedby={available ? undefined : 'anki-create-reason'}
              onClick={create}
            >
              {creating ? t.anki.verifying : t.anki.createInAnki}
            </button>
          </div>
          {!available && (
            <span id="anki-create-reason" className={`${ui.helpWarn} ${styles.reason}`}>
              {t.anki.needAnkiOpen}
            </span>
          )}
        </aside>
      )}
    </div>
  );
}

export interface ConvertedEntry {
  readonly id: number;
  readonly date: string;
  readonly correct: string;
  readonly category: string;
  readonly state: 'verified' | 'stale' | 'legacy';
}

export function ConvertedList({ entries, available }: { readonly entries: readonly ConvertedEntry[]; readonly available: boolean }) {
  return (
    <ul className={styles.converted}>
      {entries.map((entry) => <ConvertedRow key={entry.id} entry={entry} available={available} />)}
    </ul>
  );
}

function ConvertedRow({ entry, available }: { readonly entry: ConvertedEntry; readonly available: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (action: (id: number) => Promise<{ ok: boolean; message: string }>) => {
    start(async () => {
      try {
        const result = await action(entry.id);
        toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
      } catch {
        toast({ message: t.anki.actionUncertain, tone: 'error' });
      }
    });
  };
  const stateClass = entry.state === 'verified' ? ui.ankiConverted : entry.state === 'stale' ? ui.ankiStale : ui.ankiNone;
  return (
    <li className={`${styles.convertedRow} ${pending ? styles.going : ''}`}>
      <span className={styles.muted}>{entry.date}</span>
      <span className={ui.cellStack}>
        <span className={styles.correctMono}>{entry.correct}</span>
        <span className={ui.cellSub}>{entry.category}</span>
      </span>
      <span className={stateClass}>{t.anki.convertedState[entry.state]}</span>
      <span className={styles.convertedActions}>
        {entry.state === 'stale' && (
          <button
            type="button"
            className={`${ui.primary} ${ui.compact}`}
            aria-disabled={!available || pending}
            aria-busy={pending}
            title={available ? t.anki.updateTitle : t.anki.updateNeedsAnki}
            onClick={() => { if (available && !pending) run(updateAnkiAction); }}
          >
            {t.anki.updateInAnki}
          </button>
        )}
        <button type="button" className={`${ui.ghost} ${ui.compact}`} disabled={pending} onClick={() => { run(undoAddedAction); }}>
          {t.anki.returnToPending}
        </button>
      </span>
    </li>
  );
}
