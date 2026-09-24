'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import type { ImportedBatch } from '@/lib/import/errors';
import { useToast } from '../_shared/Toast';
import { ImportWorkspace } from './ImportWorkspace';
import { type TandaDraft, blankHeader, clearDraft, useStoredDraft } from './tandaDraft';

/**
 * Controlador de la importación de una vista. Guarda el texto pegado y, al revisar,
 * sustituye la vista por el espacio de revisión. La vista se oculta, no se desmonta: una
 * captura a medias o el texto pegado siguen ahí al volver.
 *
 * - En Sesiones no hay destino fijo: se crea una sesión o se elige una abierta.
 * - En una sesión abierta, el destino es ella.
 */

interface ImportHostValue {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly review: (batch: ImportedBatch) => void;
  readonly fixedTarget: SessionRow | null;
  readonly today: string;
  /** Borrador guardado de una revisión que no llegó a confirmarse. */
  readonly stored: TandaDraft | null;
  readonly recover: () => void;
  readonly discardStored: () => void;
  /** Cuántas tandas se han guardado en la sesión fija: la vista cierra el pegado al cambiar. */
  readonly savedRounds: number;
}

const ImportHostContext = createContext<ImportHostValue | null>(null);

export function useImportHost(): ImportHostValue {
  const value = useContext(ImportHostContext);
  if (value === null) throw new Error('useImportHost fuera de ImportHost');
  return value;
}

export function ImportHost({ today, openSessions, fixedTarget = null, subcategorySuggestions, children }: {
  readonly today: string;
  readonly openSessions: readonly SessionRow[];
  readonly fixedTarget?: SessionRow | null;
  readonly subcategorySuggestions: readonly string[];
  readonly children: ReactNode;
}) {
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState<TandaDraft | null>(null);
  const [savedRounds, setSavedRounds] = useState(0);
  const router = useRouter();
  const toast = useToast();
  const storedDraft = useStoredDraft();

  // Solo se ofrece recuperar un borrador que encaja aquí: en una sesión, el suyo.
  const stored = storedDraft !== null && (fixedTarget === null || storedDraft.targetId === fixedTarget.id)
    ? storedDraft
    : null;

  const value = useMemo((): ImportHostValue => ({
    text,
    setText,
    fixedTarget,
    today,
    stored,
    review: (batch) => {
      const rows = batch.errors.map((error, id) => ({ ...error, id }));
      setReviewing({
        v: 1,
        savedAt: '',
        targetId: fixedTarget?.id ?? null,
        header: batch.session === null ? blankHeader(today) : { ...batch.session, durationMin: null },
        importedHeader: batch.session,
        rows,
        selectedId: rows[0]?.id ?? null,
      });
    },
    recover: () => { if (stored !== null) setReviewing(stored); },
    discardStored: clearDraft,
    savedRounds,
  }), [text, fixedTarget, today, stored, savedRounds]);

  return (
    <ImportHostContext.Provider value={value}>
      <div hidden={reviewing !== null}>{children}</div>
      {reviewing !== null && (
        <ImportWorkspace
          initial={reviewing}
          today={today}
          openSessions={openSessions}
          fixedTarget={fixedTarget}
          subcategorySuggestions={subcategorySuggestions}
          onBack={() => { setReviewing(null); }}
          onSaved={(message, sessionId) => {
            setText('');
            if (fixedTarget !== null && fixedTarget.id === sessionId) {
              // La acción ya revalida la sesión: solo hay que salir de la revisión.
              setReviewing(null);
              setSavedRounds((value) => value + 1);
              toast({ message });
              return;
            }
            router.push(`/registrar?s=${String(sessionId)}&aviso=${encodeURIComponent(message)}`);
          }}
        />
      )}
    </ImportHostContext.Provider>
  );
}
