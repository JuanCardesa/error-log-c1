/**
 * Límites de Writing, compartidos por Zod y por los CHECK de la base. Un texto de C1 ronda
 * los 1 500 caracteres: veinte mil dejan sitio de sobra sin aceptar cualquier cosa.
 */
export const WRITING_LIMITS = {
  title: 200,
  taskPrompt: 5_000,
  text: 20_000,
  longNote: 5_000,
  annotationNote: 2_000,
  annotations: 300,
  wordRange: 2_000,
  /** Lo que se puede pegar de una vez: una redacción con trescientas anotaciones largas cabe de sobra. */
  importChars: 500_000,
} as const;

/** Las bandas admiten medios puntos: 2,5 sí; 2,3 no. */
export const BAND_STEP = 0.5;
