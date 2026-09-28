import {
  CAUSE_META,
  type Category,
  type Cause,
  type CauseSide,
  type Confidence,
  type Corrector,
  type Genre,
  type Paper,
  type SessionKind,
  type SessionStatus,
  type Source,
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

/** Nombre completo, para cabeceras con espacio. */
export const PAPER_LONG_LABELS: Readonly<Record<Paper, string>> = {
  RUOE: 'Reading & Use of English',
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
  'DO NOW': 'Prioritaria',
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

/**
 * Estado de un error frente a Anki, tal como se lee en las listas. «No aplica» no es
 * «Pendiente»: su causa no genera tarjeta.
 */
export type AnkiState = 'PENDING' | 'CONVERTED' | 'LEGACY' | 'NOT_APPLICABLE';

export function ankiState(error: {
  readonly cause: Cause;
  readonly ankiAdded: boolean;
  readonly ankiNoteId: number | null;
}): AnkiState {
  if (!CAUSE_META[error.cause].generatesCard) return 'NOT_APPLICABLE';
  if (!error.ankiAdded) return 'PENDING';
  return error.ankiNoteId === null ? 'LEGACY' : 'CONVERTED';
}

export const ANKI_STATE_LABELS: Readonly<Record<AnkiState, string>> = {
  PENDING: 'Pendiente',
  CONVERTED: 'Convertida',
  LEGACY: 'Marca manual',
  NOT_APPLICABLE: 'No aplica',
};

/**
 * La recomendación de cada regla, dicha como instrucción breve. No cambia su significado,
 * su prioridad ni sus condiciones: solo el tono con el que se lee en Progreso.
 */
export const RULE_RECOMMENDATIONS: Readonly<Record<number, string>> = {
  0: 'Congela el vocabulario nuevo dos semanas y trabaja el protocolo de examen',
  1: 'Baja de nivel o sube el ritmo de Anki antes de hacer más simulacros',
  2: 'Da prioridad a las tarjetas de contraste de tus falsas certezas',
  3: 'Dedica los sábados de las próximas tres semanas a una sola categoría',
  4: 'Dedica una sesión a tus tarjetas pendientes de Anki',
  5: 'Practica parts cronometrados sueltos en vez de sesiones largas',
  6: 'Lee la corrección con el original delante antes de reescribir',
};

/**
 * Etiqueta de una categoria que podria no ser del enum (una fila editada a mano, un
 * espejo de Anki antiguo). Dice que no se reconoce y cual llego: con el codigo solo,
 * parecia una etiqueta; con un texto generico, dos desconocidas serian indistinguibles.
 */
export function categoryLabel(value: string): string {
  return (CATEGORY_LABELS as Readonly<Record<string, string | undefined>>)[value]
    ?? `Categoría no reconocida (${value})`;
}
