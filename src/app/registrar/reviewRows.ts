import { CATEGORIES } from '@/lib/domain/enums';
import type { ImportDraft, ImportedSession } from '@/lib/import/errors';
import { RULE_NOTE_MIN_LENGTH } from '@/lib/validation/schemas';

/**
 * Revisión de una tanda sin React: qué le falta a cada fila y cómo se empaqueta el envío.
 *
 * El borrador de la tanda vive en un estado por id de fila, no en los campos montados:
 * el editor enseña una fila cada vez y las demás tienen que seguir enviándose enteras.
 */

export interface RowSnapshot {
  readonly itemRef: string;
  readonly prompt: string;
  readonly myAnswer: string;
  readonly correctAnswer: string;
  readonly category: string;
  readonly ruleNote: string;
}

export type MissingField = 'correctAnswer' | 'category' | 'ruleNote' | 'prompt';

export const MISSING_LABELS: Readonly<Record<MissingField, string>> = {
  correctAnswer: 'corrección',
  category: 'categoría',
  ruleNote: 'regla',
  prompt: 'enunciado',
};

export function snapshotFromDraft(draft: ImportDraft): RowSnapshot {
  const { itemRef, prompt, myAnswer, correctAnswer, category, ruleNote } = draft;
  return { itemRef, prompt, myAnswer, correctAnswer, category, ruleNote };
}

export function missingFields(row: RowSnapshot): MissingField[] {
  const missing: MissingField[] = [];
  if (row.correctAnswer.trim() === '') missing.push('correctAnswer');
  if (!(CATEGORIES as readonly string[]).includes(row.category)) missing.push('category');
  if (row.ruleNote.trim().length < RULE_NOTE_MIN_LENGTH) missing.push('ruleNote');
  if (row.prompt.trim() === '') missing.push('prompt');
  return missing;
}

/** Una fila de la tanda con id estable: quitar otra no la desplaza. */
export interface DraftRow extends ImportDraft {
  readonly id: number;
}

/** Campos de cada fila, en el orden en que viajan. */
const ROW_FIELDS = ['itemRef', 'prompt', 'myAnswer', 'correctAnswer', 'cause', 'category', 'subcategory', 'confidence', 'ruleNote'] as const;

/**
 * Lo que se envía al servidor desde la revisión de una tanda. Es el contrato con
 * importSessionAction e importErrorsAction: el paquete lleva `envelope` (con cabecera) o
 * `rows` (sin ella), más `sessionId` cuando hay destino y `durationMin` al crear sesión.
 *
 * - Sin destino, `header` es la cabecera ya editada y se crea la sesión con ella.
 * - Con destino, `header` es la del bloque tal como llegó: la sesión conserva la suya.
 */
export function buildImportPayload(rows: readonly ImportDraft[], options: {
  readonly targetId: number | null;
  readonly header: ImportedSession | undefined;
  readonly durationMin?: number | null;
  readonly importId?: string;
}): FormData {
  const values = rows.map((row) => ({
    ...Object.fromEntries(ROW_FIELDS.map((field) => [field, row[field]])),
    lateInSession: row.lateInSession,
  }));
  const payload = new FormData();
  if (options.targetId !== null) payload.set('sessionId', String(options.targetId));
  if (options.header !== undefined) {
    payload.set('envelope', JSON.stringify({ session: options.header, errors: values }));
    if (options.targetId === null) {
      if (options.importId !== undefined) payload.set('importId', options.importId);
      payload.set('durationMin', options.durationMin === null || options.durationMin === undefined ? '' : String(options.durationMin));
    }
  } else payload.set('rows', JSON.stringify(values));
  return payload;
}

/** Siguiente fila pendiente después de `fromIndex`, dando la vuelta. `null` si no queda ninguna. */
export function nextPendingIndex(rows: readonly ImportDraft[], fromIndex: number): number | null {
  const n = rows.length;
  for (let step = 1; step <= n; step += 1) {
    const index = (fromIndex + step) % n;
    const row = rows[index];
    if (row !== undefined && missingFields(snapshotFromDraft(row)).length > 0) return index;
  }
  return null;
}
