/**
 * Taxonomias cerradas (SPEC §3). No se amplian sin tocar antes docs/SPEC.md:
 * son el contrato del producto, no un detalle de implementacion.
 */

export const SESSION_KINDS = ['DRILL', 'PARCIAL', 'SIMULACRO', 'CLASE', 'WRITING'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const PAPERS = ['RUOE', 'WRITING', 'LISTENING', 'SPEAKING'] as const;
export type Paper = (typeof PAPERS)[number];

export const SOURCES = [
  'LIBRO',
  'WORKBOOK',
  'TRAINER',
  'PAST_PAPER',
  'ONLINE',
  'ACADEMIA',
] as const;
export type Source = (typeof SOURCES)[number];

export const SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CAUSES = [
  'DESCONOCIMIENTO',
  'CONFUSION',
  'DESPISTE',
  'FORMATO',
  'TIEMPO',
  'ORTOGRAFIA',
] as const;
export type Cause = (typeof CAUSES)[number];

export const CATEGORIES = [
  'COLOCACION',
  'PHRASAL_VERB',
  'WORD_FORMATION',
  'PREPOSICION_DEPENDIENTE',
  'TIEMPO_VERBAL',
  'ESTRUCTURA',
  'ARTICULO_CUANTIFICADOR',
  'LEXICO',
  'EXPRESION_FIJA',
  'DISCURSO',
  'COMPRENSION',
  'REGISTRO',
  'ESTRUCTURA_TEXTO',
  'SPELLING',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCES = ['SEGURO', 'DUDABA', 'ADIVINE'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const GENRES = ['ESSAY', 'REPORT', 'PROPOSAL', 'LETTER', 'REVIEW'] as const;
export type Genre = (typeof GENRES)[number];

export const CORRECTORS = ['PROFESOR', 'YO', 'IA'] as const;
export type Corrector = (typeof CORRECTORS)[number];

/** Numero maximo de `part` por paper (SPEC §2). */
export const MAX_PART: Readonly<Record<Paper, number>> = {
  RUOE: 8,
  WRITING: 2,
  LISTENING: 4,
  SPEAKING: 4,
};

/**
 * `study` = se arregla estudiando. `exec` = se arregla cambiando el protocolo de examen.
 * Esta division es la que da color a los chips de la UI y la que separa las reglas 0 y 1.
 */
export type CauseSide = 'study' | 'exec';

export interface CauseMeta {
  readonly side: CauseSide;
  /** Si genera deuda de Anki (`DEBT`). SPEC §3. */
  readonly generatesCard: boolean;
  readonly meaning: string;
  readonly remedy: string;
}

export const CAUSE_META: Readonly<Record<Cause, CauseMeta>> = {
  DESCONOCIMIENTO: {
    side: 'study',
    generatesCard: true,
    meaning: 'No lo sabía, no podía saberlo',
    remedy: 'Tarjeta Anki y nada más',
  },
  CONFUSION: {
    side: 'study',
    generatesCard: true,
    meaning: 'Lo sabía, elegí mal entre dos',
    remedy: 'Tarjeta de contraste con el par confundido',
  },
  DESPISTE: {
    side: 'exec',
    generatesCard: false,
    meaning: 'Lo sabía. No leí / no releí / no comprobé',
    remedy: 'No se estudia. Cambia el protocolo de revisión',
  },
  FORMATO: {
    side: 'exec',
    generatesCard: false,
    meaning: 'Rompí una norma de la tarea',
    remedy: 'Releer instrucciones del paper, checklist',
  },
  TIEMPO: {
    side: 'exec',
    generatesCard: false,
    meaning: 'Se acabó el tiempo o fui con prisa',
    remedy: 'Gestión del tiempo, no contenido',
  },
  ORTOGRAFIA: {
    side: 'study',
    generatesCard: true,
    meaning: 'Sabía la palabra, la escribí mal',
    remedy: 'Tarjeta de spelling. Crítico en Listening P2',
  },
};

export function generatesCard(cause: Cause): boolean {
  return CAUSE_META[cause].generatesCard;
}

/** Partes validas de un paper, como lista, para poblar selects. */
export function partsFor(paper: Paper): readonly number[] {
  return Array.from({ length: MAX_PART[paper] }, (_, index) => index + 1);
}
