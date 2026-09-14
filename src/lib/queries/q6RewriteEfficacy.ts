import { toCsv } from '../csv/csv';
import type { Genre } from '../domain/enums';
import type { Dataset, ErrorRow, QueryOptions, WritingPieceRow } from '../domain/types';
import { percentage, sliceWindow } from './window';

/**
 * Q6 · Eficacia del rewrite.
 *
 * De los errores del texto original, cuantos reaparecen en su reescritura. Los textos se
 * emparejan por `rewrite_of`, y un error se considera el mismo si coinciden
 * `(category, subcategory, correct_answer)`.
 *
 * Los errores se atribuyen a un texto a traves de su sesion. Eso es correcto porque
 * `writing_piece.session_id` es UNIQUE (decision P1): una sesion tiene como mucho un
 * texto, y una reescritura es su propia sesion.
 */

export interface Q6Pair {
  readonly originalId: number;
  readonly rewriteId: number;
  readonly genre: Genre;
  readonly originalErrors: number;
  readonly repeatedErrors: number;
  /** `null` si el original no tenia errores: no hay nada que repetir. */
  readonly pctRepeated: number | null;
}

export interface Q6Result {
  readonly pairs: readonly Q6Pair[];
  readonly totalOriginalErrors: number;
  readonly totalRepeated: number;
  /** Agregado sobre todos los pares. `null` si no hay pares o no hay errores originales. */
  readonly pctRepeated: number | null;
}

/**
 * Clave de identidad de un error a efectos de "es el mismo fallo otra vez".
 * Se normaliza espacio y caja: `Meanwhile ` y `meanwhile` son el mismo fallo.
 */
function errorKey(error: ErrorRow): string {
  const subcategory = (error.subcategory ?? '').trim().toLowerCase();
  const answer = error.correctAnswer.trim().toLowerCase();
  return `${error.category}|${subcategory}|${answer}`;
}

/** Errores de una sesion; lista vacia si no tiene ninguno, que es un caso normal. */
function errorsOf(index: Map<number, ErrorRow[]>, sessionId: number): readonly ErrorRow[] {
  const found = index.get(sessionId);
  return found === undefined ? [] : found;
}

export function q6RewriteEfficacy(data: Dataset, options: QueryOptions): Q6Result {
  const { sessionIds } = sliceWindow(data, options.now, options.windowDays);

  const pieceById = new Map<number, WritingPieceRow>(
    data.pieces.map((piece) => [piece.id, piece]),
  );

  const errorsBySession = new Map<number, ErrorRow[]>();
  for (const error of data.errors) {
    const bucket = errorsBySession.get(error.sessionId);
    if (bucket === undefined) errorsBySession.set(error.sessionId, [error]);
    else bucket.push(error);
  }

  const pairs: Q6Pair[] = [];
  let totalOriginalErrors = 0;
  let totalRepeated = 0;

  for (const rewrite of data.pieces) {
    if (rewrite.rewriteOf === null) continue;

    const original = pieceById.get(rewrite.rewriteOf);
    if (original === undefined) continue;

    // La reescritura ancla el par en el tiempo: es el trabajo que se esta evaluando.
    if (!sessionIds.has(rewrite.sessionId)) continue;

    const originalErrors = errorsOf(errorsBySession, original.sessionId);
    const rewriteKeys = new Set(errorsOf(errorsBySession, rewrite.sessionId).map(errorKey));

    const repeated = originalErrors.filter((error) => rewriteKeys.has(errorKey(error)));

    totalOriginalErrors += originalErrors.length;
    totalRepeated += repeated.length;

    pairs.push({
      originalId: original.id,
      rewriteId: rewrite.id,
      genre: rewrite.genre,
      originalErrors: originalErrors.length,
      repeatedErrors: repeated.length,
      pctRepeated:
        originalErrors.length === 0
          ? null
          : percentage(repeated.length, originalErrors.length),
    });
  }

  pairs.sort((a, b) => a.originalId - b.originalId);

  return {
    pairs,
    totalOriginalErrors,
    totalRepeated,
    pctRepeated:
      totalOriginalErrors === 0 ? null : percentage(totalRepeated, totalOriginalErrors),
  };
}

export function q6ToCsv(result: Q6Result): string {
  return toCsv(
    ['original_id', 'rewrite_id', 'genero', 'errores_original', 'repetidos', 'pct_repetidos'],
    result.pairs.map((pair) => [
      pair.originalId,
      pair.rewriteId,
      pair.genre,
      pair.originalErrors,
      pair.repeatedErrors,
      pair.pctRepeated,
    ]),
  );
}
