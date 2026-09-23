import { CATEGORIES } from '@/lib/domain/enums';
import type { ImportDraft, ImportedSession } from '@/lib/import/errors';
import { RULE_NOTE_MIN_LENGTH } from '@/lib/validation/schemas';

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
  correctAnswer: 'correcta',
  category: 'categoría',
  ruleNote: 'regla',
  prompt: 'enunciado',
};

export function snapshotFromDraft(draft: ImportDraft): RowSnapshot {
  const { itemRef, prompt, myAnswer, correctAnswer, category, ruleNote } = draft;
  return { itemRef, prompt, myAnswer, correctAnswer, category, ruleNote };
}

export function readRow(data: FormData, id: number): RowSnapshot {
  const read = (field: keyof RowSnapshot): string => {
    const value = data.get(`${String(id)}.${field}`);
    return typeof value === 'string' ? value : '';
  };
  return {
    itemRef: read('itemRef'),
    prompt: read('prompt'),
    myAnswer: read('myAnswer'),
    correctAnswer: read('correctAnswer'),
    category: read('category'),
    ruleNote: read('ruleNote'),
  };
}

export function missingFields(row: RowSnapshot): MissingField[] {
  const missing: MissingField[] = [];
  if (row.correctAnswer.trim() === '') missing.push('correctAnswer');
  if (!(CATEGORIES as readonly string[]).includes(row.category)) missing.push('category');
  if (row.ruleNote.trim().length < RULE_NOTE_MIN_LENGTH) missing.push('ruleNote');
  if (row.prompt.trim() === '') missing.push('prompt');
  return missing;
}

/** Campos de texto de cada fila, en el orden en que viajan. */
const ROW_TEXT_FIELDS = ['itemRef', 'prompt', 'myAnswer', 'correctAnswer', 'cause', 'category', 'subcategory', 'confidence', 'ruleNote'] as const;

/**
 * Lo que se envia al servidor desde la revision de una tanda. Es el contrato con
 * importSessionAction e importErrorsAction: los campos de cada fila se leen por su nombre
 * `N.campo`, y el paquete lleva `envelope` (con cabecera) o `rows` (sin ella), mas
 * `sessionId` cuando hay destino. Vive aqui, sin React, para poder probarlo sin navegador.
 */
export function buildImportPayload(form: FormData, rowIds: readonly number[], options: {
  readonly targetId: number | null;
  readonly importedHeader: ImportedSession | undefined;
}): FormData {
  const values = rowIds.map((id) => {
    const prefix = `${String(id)}.`;
    return {
      ...Object.fromEntries(ROW_TEXT_FIELDS.map((field) => [field, form.get(`${prefix}${field}`)])),
      lateInSession: form.has(`${prefix}lateInSession`),
    };
  });
  const payload = new FormData();
  if (options.targetId !== null) payload.set('sessionId', String(options.targetId));
  if (options.importedHeader !== undefined) {
    const number = (key: string) => form.get(key) === null || form.get(key) === '' ? null : Number(form.get(key));
    // Sin destino se crea la sesion con la cabecera editada; con destino se conserva la suya.
    const header = options.targetId === null ? {
      date: form.get('date'), kind: form.get('kind'), paper: form.get('paper') || null,
      part: number('part'), source: form.get('source'), sourceRef: form.get('sourceRef'),
      itemsTotal: number('itemsTotal'), itemsCorrect: number('itemsCorrect'), timed: form.has('timed'),
    } : options.importedHeader;
    payload.set('envelope', JSON.stringify({ session: header, errors: values }));
    if (options.targetId === null) payload.set('durationMin', String(form.get('durationMin') ?? ''));
  } else payload.set('rows', JSON.stringify(values));
  return payload;
}
