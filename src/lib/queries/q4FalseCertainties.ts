import { toCsv } from '../csv/csv';
import type { Category, Cause } from '../domain/enums';
import { FIXED_WINDOW_DAYS } from '../domain/thresholds';
import type { Dataset } from '../domain/types';
import { sliceWindow } from './window';

/**
 * Q4 · Falsas certezas.
 *
 * Errores cometidos con `confidence = SEGURO`. No se agregan: se listan uno a uno,
 * porque cada uno es una creencia falsa instalada y hay que verla escrita.
 *
 * Usa **30 dias fijos**, no la ventana conmutable (decision P2): el umbral de la regla 2
 * que se alimenta de aqui es un conteo absoluto calibrado a 30 dias.
 */

export interface Q4Row {
  readonly errorId: number;
  readonly date: string;
  readonly cause: Cause;
  readonly category: Category;
  readonly subcategory: string | null;
  readonly myAnswer: string | null;
  readonly correctAnswer: string;
  readonly ruleNote: string;
}

export interface Q4Options {
  readonly now: Date;
}

export function q4FalseCertainties(data: Dataset, options: Q4Options): readonly Q4Row[] {
  const { pairs } = sliceWindow(data, options.now, FIXED_WINDOW_DAYS);

  return pairs
    .filter(({ error }) => error.confidence === 'SEGURO')
    .map(({ error, session }) => ({
      errorId: error.id,
      date: session.date,
      cause: error.cause,
      category: error.category,
      subcategory: error.subcategory,
      myAnswer: error.myAnswer,
      correctAnswer: error.correctAnswer,
      ruleNote: error.ruleNote,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.errorId - a.errorId);
}

export function q4ToCsv(rows: readonly Q4Row[]): string {
  return toCsv(
    ['fecha', 'causa', 'categoria', 'subcategoria', 'mi_respuesta', 'correcta', 'regla'],
    rows.map((row) => [
      row.date,
      row.cause,
      row.category,
      row.subcategory,
      row.myAnswer,
      row.correctAnswer,
      row.ruleNote,
    ]),
  );
}
