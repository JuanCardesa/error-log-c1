import type { Dataset, ErrorRow, SessionRow } from '../domain/types';
import { inWindow } from '../time/dates';

/**
 * Corte de la ventana. Un error pertenece a la ventana si la pertenece **su sesion**:
 * la fecha que cuenta es la de la practica, no la de cuando se transcribio el error.
 */

/**
 * Un error junto a su sesion, ya resuelta. Las queries trabajan sobre esto en vez de
 * buscar la sesion despues: asi no hace falta un fallback para un caso que no puede
 * ocurrir, y no queda una rama imposible de testear en mitad de la logica.
 */
export interface WindowPair {
  readonly error: ErrorRow;
  readonly session: SessionRow;
}

export interface WindowSlice {
  readonly sessions: readonly SessionRow[];
  readonly errors: readonly ErrorRow[];
  readonly pairs: readonly WindowPair[];
  /** Ids de las sesiones de la ventana, para pruebas de pertenencia. */
  readonly sessionIds: ReadonlySet<number>;
}

export function sliceWindow(data: Dataset, now: Date, days: number): WindowSlice {
  const sessions = data.sessions.filter((session) => inWindow(session.date, now, days));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  const pairs: WindowPair[] = [];
  for (const error of data.errors) {
    const session = sessionById.get(error.sessionId);
    if (session !== undefined) pairs.push({ error, session });
  }

  return {
    sessions,
    errors: pairs.map((pair) => pair.error),
    pairs,
    sessionIds: new Set(sessionById.keys()),
  };
}

/** Redondeo a `decimals` cifras, evitando el -0 y el ruido de coma flotante. */
export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

export function percentage(part: number, whole: number, decimals = 1): number {
  if (whole === 0) return 0;
  return round((100 * part) / whole, decimals);
}
