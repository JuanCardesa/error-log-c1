import { CATEGORIES } from '@/lib/domain/enums';
import type { ImportDraft } from '@/lib/import/errors';
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
