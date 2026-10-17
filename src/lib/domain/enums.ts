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

/** Pendiente de corrección, corregido, o práctica que nadie va a corregir. */
export const WRITING_STATUSES = ['AWAITING', 'CORRECTED', 'NOT_SUBMITTED'] as const;
export type WritingStatus = (typeof WRITING_STATUSES)[number];

/** De dónde sale la fecha de un texto cuando no se sabe cuándo se escribió. */
export const WRITING_DATE_BASES = ['WRITTEN', 'CORRECTED', 'IMPORTED'] as const;
export type WritingDateBasis = (typeof WRITING_DATE_BASES)[number];

/** Los cuatro criterios con los que Cambridge puntúa cada texto, de 0 a 5. */
export const WRITING_CRITERIA = ['CONTENT', 'COMMUNICATIVE', 'ORGANISATION', 'LANGUAGE'] as const;
export type WritingCriterion = (typeof WRITING_CRITERIA)[number];

export const ANNOTATION_KINDS = ['ERROR', 'IMPROVEMENT', 'STRENGTH', 'COMMENT'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** Un fragmento del texto, un párrafo entero o el texto completo. */
export const ANNOTATION_SCOPES = ['SPAN', 'PARAGRAPH', 'DOCUMENT'] as const;
export type AnnotationScope = (typeof ANNOTATION_SCOPES)[number];

/**
 * Sobre qué trata una anotación de Writing. No son las categorías de error (§3): esas
 * describen fallos de Use of English, y aquí también se señalan aciertos, contenido y
 * claridad. La equivalencia con aquellas solo hará falta si una anotación pasa al registro.
 */
export const ANNOTATION_FOCUSES = [
  'GRAMMAR',
  'SPELLING',
  'PUNCTUATION',
  'WORD_ORDER',
  'VOCABULARY',
  'COLLOCATION',
  'REGISTER',
  'CLARITY',
  'LINKING',
  'ORGANISATION',
  'CONTENT',
  'OTHER',
] as const;
export type AnnotationFocus = (typeof ANNOTATION_FOCUSES)[number];

/** Criterio al que pertenece cada foco. `OTHER` no cuenta para ninguno. */
export const FOCUS_CRITERION: Readonly<Record<AnnotationFocus, WritingCriterion | null>> = {
  GRAMMAR: 'LANGUAGE',
  SPELLING: 'LANGUAGE',
  PUNCTUATION: 'LANGUAGE',
  WORD_ORDER: 'LANGUAGE',
  VOCABULARY: 'LANGUAGE',
  COLLOCATION: 'LANGUAGE',
  REGISTER: 'COMMUNICATIVE',
  CLARITY: 'COMMUNICATIVE',
  LINKING: 'ORGANISATION',
  ORGANISATION: 'ORGANISATION',
  CONTENT: 'CONTENT',
  OTHER: null,
};

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

/** Qué significa y qué remedio tiene cada causa se lee en el diccionario de la interfaz. */
export interface CauseMeta {
  readonly side: CauseSide;
  /** Si genera deuda de Anki (`DEBT`). SPEC §3. */
  readonly generatesCard: boolean;
}

export const CAUSE_META: Readonly<Record<Cause, CauseMeta>> = {
  DESCONOCIMIENTO: { side: 'study', generatesCard: true },
  CONFUSION: { side: 'study', generatesCard: true },
  DESPISTE: { side: 'exec', generatesCard: false },
  FORMATO: { side: 'exec', generatesCard: false },
  TIEMPO: { side: 'exec', generatesCard: false },
  ORTOGRAFIA: { side: 'study', generatesCard: true },
};

export function generatesCard(cause: Cause): boolean {
  return CAUSE_META[cause].generatesCard;
}

/** Partes validas de un paper, como lista, para poblar selects. */
export function partsFor(paper: Paper): readonly number[] {
  return Array.from({ length: MAX_PART[paper] }, (_, index) => index + 1);
}
