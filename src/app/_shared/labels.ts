import type {
  Category,
  Cause,
  CauseSide,
  Confidence,
  Corrector,
  Genre,
  Paper,
  SessionKind,
  SessionStatus,
  Source,
} from '@/lib/domain/enums';
import type { RuleStatus } from '@/lib/rules';

/**
 * Etiquetas de interfaz para los valores de las taxonomias.
 *
 * Solo cambian lo que se lee en pantalla: el `value` de cada control, lo que se guarda y
 * lo que se exporta siguen siendo el enum tal cual (SPEC §3).
 */

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  COLOCACION: 'Colocación',
  PHRASAL_VERB: 'Phrasal verb',
  WORD_FORMATION: 'Word formation',
  PREPOSICION_DEPENDIENTE: 'Preposición dependiente',
  TIEMPO_VERBAL: 'Tiempo verbal',
  ESTRUCTURA: 'Estructura',
  ARTICULO_CUANTIFICADOR: 'Artículo o cuantificador',
  LEXICO: 'Léxico',
  EXPRESION_FIJA: 'Expresión fija',
  DISCURSO: 'Discurso',
  COMPRENSION: 'Comprensión',
  REGISTRO: 'Registro',
  ESTRUCTURA_TEXTO: 'Estructura del texto',
  SPELLING: 'Spelling',
};

export const CAUSE_LABELS: Readonly<Record<Cause, string>> = {
  DESCONOCIMIENTO: 'Desconocimiento',
  CONFUSION: 'Confusión',
  DESPISTE: 'Despiste',
  FORMATO: 'Formato',
  TIEMPO: 'Tiempo',
  ORTOGRAFIA: 'Ortografía',
};

export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  SEGURO: 'Seguro',
  DUDABA: 'Dudaba',
  ADIVINE: 'Adiviné',
};

export const KIND_LABELS: Readonly<Record<SessionKind, string>> = {
  DRILL: 'Drill',
  PARCIAL: 'Parcial',
  SIMULACRO: 'Simulacro',
  CLASE: 'Clase',
  WRITING: 'Writing',
};

export const PAPER_LABELS: Readonly<Record<Paper, string>> = {
  RUOE: 'RUOE',
  WRITING: 'Writing',
  LISTENING: 'Listening',
  SPEAKING: 'Speaking',
};

export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  LIBRO: 'Libro',
  WORKBOOK: 'Workbook',
  TRAINER: 'Trainer',
  PAST_PAPER: 'Examen pasado',
  ONLINE: 'Online',
  ACADEMIA: 'Academia',
};

export const STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};

export const SIDE_LABELS: Readonly<Record<CauseSide, string>> = {
  study: 'estudio',
  exec: 'ejecución',
};

export const GENRE_LABELS: Readonly<Record<Genre, string>> = {
  ESSAY: 'Essay',
  REPORT: 'Report',
  PROPOSAL: 'Proposal',
  LETTER: 'Letter',
  REVIEW: 'Review',
};

export const CORRECTOR_LABELS: Readonly<Record<Corrector, string>> = {
  PROFESOR: 'Profesor',
  YO: 'Yo',
  IA: 'IA',
};

export const RULE_STATUS_LABELS: Readonly<Record<RuleStatus, string>> = {
  'DO NOW': 'Haz esto',
  QUEUED: 'En cola',
  WATCH: 'Vigilar',
  ok: 'Bien',
  'needs n ≥ 15': 'Muestra corta',
  'n/a': 'Sin datos',
};

/**
 * Que mide cada regla, dicho para leerlo. El motor nombra sus señales por la variable que
 * calcula (`pct_convertidos (Q5)`); la interfaz las cuenta en palabras.
 */
export const RULE_SIGNAL_LABELS: Readonly<Record<number, string>> = {
  0: 'Despiste y tiempo sobre el total de errores',
  1: 'Desconocimiento sobre el total de errores',
  2: 'Falsas certezas en los últimos 30 días',
  3: 'Una sola categoría sobre el total de errores',
  4: 'Errores convertidos en tarjeta de Anki',
  5: 'Errores al final de sesiones cronometradas',
  6: 'Errores del original que se repiten al reescribir',
};

/** Etiqueta de una categoria que puede venir de fuera (Anki) y no ser del enum. */
export function categoryLabel(value: string): string {
  return (CATEGORY_LABELS as Readonly<Record<string, string>>)[value] ?? value;
}
