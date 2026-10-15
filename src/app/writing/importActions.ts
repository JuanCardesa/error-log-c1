'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { applyWritingImport, previewWritingImport } from '@/lib/db/writingRepo';
import { toIsoDate } from '@/lib/time/dates';
import type { ImportIssue } from '@/lib/writing/contract';
import { toImportView, type WritingImportView } from '@/lib/writing/previewView';
import { getT } from '../_shared/i18nServer';

/**
 * Importación de redacciones desde la pantalla. Las acciones son POST públicos: el JSON y
 * las opciones llegan sin confianza y el repositorio vuelve a validarlo todo, también lo
 * que la vista previa ya comprobó.
 */

export type WritingPreviewResponse =
  | { readonly ok: false; readonly issues: readonly ImportIssue[] }
  | { readonly ok: true; readonly view: WritingImportView };

export async function previewWritingImportAction(source: unknown, options: unknown): Promise<WritingPreviewResponse> {
  const t = await getT();
  if (typeof source !== 'string') return { ok: false, issues: [{ path: '', message: t.writingImport.empty }] };
  const preview = previewWritingImport(getDb(), source, options ?? {}, { today: toIsoDate(new Date()), t });
  return preview.ok ? { ok: true, view: toImportView(preview.data, preview.plan, preview.digest) } : preview;
}

export type WritingImportResponse =
  | { readonly ok: true; readonly href: string; readonly message: string }
  | {
    readonly ok: false;
    readonly message: string;
    readonly issues?: readonly ImportIssue[];
    /** Hay que volver a pedir la vista previa: lo guardado cambió o el plan ya no vale. */
    readonly reload: boolean;
  };

export async function importWritingAction(source: unknown, options: unknown): Promise<WritingImportResponse> {
  const t = await getT();
  const w = t.writingImport;
  if (typeof source !== 'string') return { ok: false, message: w.empty, reload: false };
  let result;
  try {
    result = applyWritingImport(getDb(), source, options, { today: toIsoDate(new Date()), now: new Date(), t });
  } catch {
    // La transacción se deshizo entera; el recibo hace seguro volver a intentarlo.
    return { ok: false, message: w.uncertain, reload: false };
  }
  if (result.ok) {
    revalidatePath('/', 'layout');
    const done = result.repeated || result.mode === 'create' ? w.created : w.updated;
    const unplaced = result.repeated ? 0 : result.unplaced;
    return { ok: true, href: '/writing', message: unplaced > 0 ? `${done}. ${w.unplacedAfter(unplaced)}` : done };
  }
  switch (result.reason) {
    case 'invalid': return { ok: false, message: w.issuesTitle, issues: result.issues, reload: false };
    case 'blocked': return { ok: false, message: w.blockedTitle, reload: true };
    case 'stale': return { ok: false, message: w.stale, reload: true };
    case 'receiptChanged': return { ok: false, message: w.receiptChanged, reload: true };
    case 'deleted': return { ok: false, message: w.deleted, reload: false };
    case 'sessionUnavailable': return { ok: false, message: w.sessionUnavailable, reload: false };
  }
}
