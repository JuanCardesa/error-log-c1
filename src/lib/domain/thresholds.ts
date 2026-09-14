/**
 * Umbrales del motor de decision (SPEC §5). Cambiar un numero de aqui cambia el
 * producto: no se toca sin actualizar docs/SPEC.md.
 */

/**
 * Ninguna regla basada en porcentaje se dispara por debajo de este n.
 * Con menos errores el porcentaje es ruido, y una accion equivocada cuesta una semana.
 */
export const MIN_N = 15;

/** Ventana de analisis por defecto, en dias, y la unica alternativa admitida. */
export const DEFAULT_WINDOW_DAYS = 30;
export const WINDOW_DAYS_OPTIONS = [30, 60] as const;
export type WindowDays = (typeof WINDOW_DAYS_OPTIONS)[number];

/**
 * Q4 y la regla 2 miran siempre 30 dias, ignorando el conmutador (decision P2).
 * El umbral de la regla 2 es un conteo absoluto calibrado a 30 dias: ampliarlo a 60
 * lo ablandaria a la mitad sin avisar.
 */
export const FIXED_WINDOW_DAYS = 30;

/** Q5: por debajo de este porcentaje de conversion, el log no cierra el circulo. */
export const ANKI_TARGET_PCT = 80;

/** Q6: por encima de este porcentaje de errores repetidos, la reescritura no sirve. */
export const REWRITE_REPEAT_PCT = 50;
