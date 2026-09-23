import { toCsv } from '../csv/csv';
import { generatesCard } from '../domain/enums';
import { ANKI_TARGET_PCT } from '../domain/thresholds';
import type { Dataset, ErrorRow, QueryOptions } from '../domain/types';
import { percentage, sliceWindow } from './window';

/**
 * Q5 · Deuda de Anki.
 *
 * Mide si el log cierra el circulo o solo acumula. El denominador son **solo** los
 * errores cuya causa genera tarjeta: contar despistes aqui seria premiar justo lo que
 * no hay que hacer con ellos.
 *
 * Con denominador cero, `pctConverted` es `null` y no 0: una base recien creada no tiene
 * una deuda del 100%, no tiene deuda. Tratar 0/0 como 0% dispararia la regla de maxima
 * prioridad sobre una base vacia.
 *
 * Las cifras miran la ventana; la cola, no. Una deuda no deja de existir por cumplir
 * sesenta dias: filtrarla por ventana hacia desaparecer pendientes antiguos de todas las
 * vistas disponibles, sin avisar y sin forma de recuperarlos.
 */

export interface Q5Result {
  /** Errores que generan tarjeta en la ventana. */
  readonly eligible: number;
  readonly added: number;
  readonly pending: number;
  readonly pctConverted: number | null;
  /** `null` cuando no hay nada que convertir. */
  readonly meetsTarget: boolean | null;
  /**
   * Cola de pendientes, la mas antigua primero: es el orden en que hay que atacarla.
   * Incluye todo lo pendiente, tambien lo anterior a la ventana.
   */
  readonly queue: readonly ErrorRow[];
}

export function q5AnkiDebt(data: Dataset, options: QueryOptions): Q5Result {
  const { pairs } = sliceWindow(data, options.now, options.windowDays);

  const eligiblePairs = pairs.filter(({ error }) => generatesCard(error.cause));
  const pendingPairs = eligiblePairs.filter(({ error }) => !error.ankiAdded);

  const eligible = eligiblePairs.length;
  const added = eligible - pendingPairs.length;

  // La cola sale del historial entero, no de la ventana.
  const sessionDate = new Map(data.sessions.map((session) => [session.id, session.date]));
  const queue = data.errors
    .filter((error) => generatesCard(error.cause) && !error.ankiAdded)
    .sort((a, b) =>
      (sessionDate.get(a.sessionId) ?? '').localeCompare(sessionDate.get(b.sessionId) ?? '')
      || a.id - b.id);

  if (eligible === 0) {
    return { eligible: 0, added: 0, pending: 0, pctConverted: null, meetsTarget: null, queue };
  }

  const pctConverted = percentage(added, eligible);

  return {
    eligible,
    added,
    pending: pendingPairs.length,
    pctConverted,
    meetsTarget: pctConverted >= ANKI_TARGET_PCT,
    queue,
  };
}

export function q5ToCsv(result: Q5Result): string {
  return toCsv(
    ['elegibles', 'convertidos', 'pendientes', 'pct_convertidos', 'umbral'],
    [[result.eligible, result.added, result.pending, result.pctConverted, ANKI_TARGET_PCT]],
  );
}
