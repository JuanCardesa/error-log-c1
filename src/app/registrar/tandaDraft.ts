'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';

import { PAPERS, SESSION_KINDS, SOURCES } from '@/lib/domain/enums';
import { importDraftSchema, type ImportedSession } from '@/lib/import/errors';
import type { DraftRow } from './reviewRows';

/**
 * Borrador de la tanda en revisión, guardado en este navegador hasta que el guardado se
 * confirma o se descarta a propósito. Sobrevive a recargar o a ir a Sesiones a comprobar
 * si un guardado incierto llegó a hacerse.
 *
 * Versionado: un borrador de otra versión o mal formado se ignora, nunca rompe la vista.
 */

const KEY = 'errorlog:tanda';
const EVENT = 'errorlog:tanda';

export type HeaderDraft = ImportedSession & { readonly durationMin: number | null };

export interface TandaDraft {
  readonly v: 1;
  readonly savedAt: string;
  /** Identidad estable de la creación, conservada entre recargas y reintentos. */
  readonly importId?: string;
  /** Sesión abierta de destino, o `null` para crear una nueva con `header`. */
  readonly targetId: number | null;
  readonly header: HeaderDraft;
  /** La cabecera tal como llegó en el bloque, si traía. Con destino se envía sin tocar. */
  readonly importedHeader: ImportedSession | null;
  readonly rows: readonly DraftRow[];
  readonly selectedId: number | null;
}

const headerSchema = z.object({
  date: z.string(),
  kind: z.enum(SESSION_KINDS),
  paper: z.enum(PAPERS).nullable(),
  part: z.number().int().nullable(),
  source: z.enum(SOURCES),
  sourceRef: z.string().nullable(),
  itemsTotal: z.number().int().nullable(),
  itemsCorrect: z.number().int().nullable(),
  timed: z.boolean(),
});

const draftSchema = z.object({
  v: z.literal(1),
  savedAt: z.string(),
  importId: z.uuid().optional(),
  targetId: z.number().int().positive().nullable(),
  header: headerSchema.extend({ durationMin: z.number().int().nullable() }),
  importedHeader: headerSchema.nullable(),
  rows: z.array(importDraftSchema.extend({ id: z.number().int().nonnegative() })),
  selectedId: z.number().int().nullable(),
});

function parse(raw: string | null): TandaDraft | null {
  if (raw === null) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeDraft(draft: Omit<TandaDraft, 'v' | 'savedAt'>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, v: 1, savedAt: new Date().toISOString() }));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Sin almacenamiento (modo privado, cuota): la revisión sigue funcionando sin copia.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Nada que limpiar.
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

/** El borrador guardado, si hay. En el servidor, ninguno. */
export function useStoredDraft(): TandaDraft | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parse(raw), [raw]);
}

/** Cabecera por defecto cuando el bloque solo trae errores: se completa en la revisión. */
export function blankHeader(today: string): HeaderDraft {
  return {
    date: today,
    kind: 'DRILL',
    paper: null,
    part: null,
    source: 'LIBRO',
    sourceRef: null,
    itemsTotal: null,
    itemsCorrect: null,
    timed: false,
    durationMin: null,
  };
}

/** Lee la cabecera editada en el formulario de la revisión. Valida el servidor. */
export function readHeaderForm(form: HTMLFormElement, fallback: HeaderDraft): HeaderDraft {
  const data = new FormData(form);
  const text = (key: string): string => {
    const value = data.get(key);
    return typeof value === 'string' ? value : '';
  };
  const number = (key: string): number | null => {
    const value = text(key).trim();
    if (value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  };
  const paper = PAPERS.find((value) => value === text('paper')) ?? null;
  return {
    date: text('date') || fallback.date,
    kind: SESSION_KINDS.find((value) => value === text('kind')) ?? fallback.kind,
    paper,
    part: paper === null ? null : number('part'),
    source: SOURCES.find((value) => value === text('source')) ?? fallback.source,
    sourceRef: text('sourceRef').trim() === '' ? null : text('sourceRef'),
    itemsTotal: paper === 'WRITING' ? null : number('itemsTotal'),
    itemsCorrect: paper === 'WRITING' ? null : number('itemsCorrect'),
    timed: data.has('timed'),
    durationMin: number('durationMin'),
  };
}

/** La cabecera sin los minutos, que viajan aparte. */
export function toImportedSession(header: HeaderDraft): ImportedSession {
  const { durationMin: _minutes, ...session } = header;
  return session;
}
