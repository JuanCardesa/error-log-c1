import type {
  Category,
  Cause,
  Confidence,
  Corrector,
  Genre,
  Paper,
  SessionKind,
  SessionStatus,
  Source,
} from './enums';

/**
 * Formas de fila que consumen las queries puras. Coinciden con el schema de Drizzle
 * pero no dependen de el: las queries se testean con fixtures, sin base de datos.
 *
 * Las fechas son cadenas ISO `YYYY-MM-DD` (fecha civil, sin hora ni zona). Los
 * timestamps son ISO 8601 completos.
 */

export type SessionFormat =
  | { readonly paper: Paper; readonly part: number }
  | { readonly paper: null; readonly part: null };

export type SessionRow = SessionFormat & {
  readonly id: number;
  readonly date: string;
  readonly kind: SessionKind;
  readonly source: Source;
  readonly sourceRef: string | null;
  /** `null` solo cuando `paper === 'WRITING'`: el Writing no se mide por items. */
  readonly itemsTotal: number | null;
  readonly itemsCorrect: number | null;
  readonly durationMin: number | null;
  readonly timed: boolean;
  readonly status: SessionStatus;
};

export interface ErrorRow {
  readonly id: number;
  readonly sessionId: number;
  readonly itemRef: string | null;
  readonly prompt: string;
  readonly myAnswer: string | null;
  readonly correctAnswer: string;
  readonly cause: Cause;
  readonly category: Category;
  readonly subcategory: string | null;
  readonly confidence: Confidence;
  readonly lateInSession: boolean;
  readonly ruleNote: string;
  readonly ankiAdded: boolean;
  readonly ankiAddedAt: string | null;
  /** Nulo cuando se marcó a mano. El vínculo se comprueba al sincronizar. */
  readonly ankiNoteId: number | null;
  /** Segundos que costo registrarlo. El spec original fija el objetivo en <30 s. */
  readonly secs: number | null;
  readonly createdAt: string;
}

export interface WritingPieceRow {
  readonly id: number;
  readonly sessionId: number;
  readonly date: string;
  readonly genre: Genre;
  readonly wordCount: number | null;
  readonly minutes: number | null;
  readonly timed: boolean;
  readonly rewriteOf: number | null;
  readonly corrector: Corrector | null;
  readonly bandContent: number | null;
  readonly bandCommunicative: number | null;
  readonly bandOrganisation: number | null;
  readonly bandLanguage: number | null;
}

/** Todo lo que necesita cualquiera de las seis queries. */
export interface Dataset {
  readonly sessions: readonly SessionRow[];
  readonly errors: readonly ErrorRow[];
  readonly pieces: readonly WritingPieceRow[];
}

export interface QueryOptions {
  /**
   * El reloj se inyecta siempre. Sin esto los tests de ventana caducan solos y la
   * suite empieza a fallar un martes cualquiera sin que nadie haya tocado nada.
   */
  readonly now: Date;
  readonly windowDays: number;
}

export interface AnkiNoteRow {
  readonly noteId: number;
  readonly model: string;
  readonly label: string;
  readonly tags: readonly string[];
  readonly category: Category | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface AnkiCardRow {
  readonly cardId: number;
  readonly noteId: number;
  readonly deck: string;
  readonly templateOrd: number;
  readonly lapses: number;
  readonly reps: number;
  readonly queue: number;
  readonly intervalDays: number;
}

export interface AnkiReviewRow {
  readonly reviewId: number;
  readonly cardId: number;
  readonly reviewedAt: string;
  readonly reviewDate: string;
  readonly ease: number;
  readonly interval: number;
  readonly lastInterval: number;
  readonly factor: number;
  readonly timeMs: number;
  readonly type: number;
}

export interface AnkiSyncRow {
  readonly id: number;
  readonly namespace: string;
  readonly profile: string;
  readonly url: string;
  readonly sourceDeck: string;
  readonly targetDeck: string;
  readonly lastSyncedAt: string | null;
  readonly notesSeen: number;
  readonly rolloverHour: number | null;
  readonly rolloverSource: 'anki' | 'config' | 'default' | null;
}

export interface AnkiDataset {
  readonly notes: readonly AnkiNoteRow[];
  readonly cards: readonly AnkiCardRow[];
  readonly reviews: readonly AnkiReviewRow[];
  readonly sync: AnkiSyncRow | null;
}

export const EMPTY_ANKI_DATASET: AnkiDataset = { notes: [], cards: [], reviews: [], sync: null };
