import type {
  Dataset,
  ErrorRow,
  SessionRow,
  WritingPieceRow,
} from '../../domain/types';
import { addDays, toIsoDate } from '../../time/dates';

/**
 * Constructores de fixtures. Deterministas: reloj fijo, ids explicitos, sin aleatoriedad.
 * Cada `make*` trae valores por defecto validos para que cada test solo declare lo que
 * de verdad esta probando.
 */

/** Lunes. Fijarlo en lunes hace predecibles las pruebas de semana ISO. */
export const NOW = new Date('2026-09-14T12:00:00Z');

export function daysAgo(days: number, from: Date = NOW): string {
  return toIsoDate(addDays(from, -days));
}

let nextId = 0;
export function resetIds(): void {
  nextId = 0;
}
function autoId(): number {
  nextId += 1;
  return nextId;
}

export function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: overrides.id ?? autoId(),
    date: daysAgo(1),
    kind: 'DRILL',
    paper: 'RUOE',
    part: 1,
    source: 'LIBRO',
    sourceRef: null,
    itemsTotal: 8,
    itemsCorrect: 6,
    durationMin: 20,
    timed: false,
    status: 'CLOSED',
    ...overrides,
  };
}

export function makeError(overrides: Partial<ErrorRow> = {}): ErrorRow {
  return {
    id: overrides.id ?? autoId(),
    sessionId: 1,
    itemRef: null,
    prompt: 'The speaker says the survey was carried out by ______',
    myAnswer: 'volunters',
    correctAnswer: 'volunteers',
    cause: 'DESCONOCIMIENTO',
    category: 'LEXICO',
    subcategory: null,
    confidence: 'DUDABA',
    lateInSession: false,
    ruleNote: 'Regla escrita con mis palabras para poder repasarla luego',
    ankiAdded: false,
    ankiAddedAt: null,
    secs: 20,
    createdAt: '2026-09-13T10:00:00.000Z',
    ...overrides,
  };
}

export function makePiece(overrides: Partial<WritingPieceRow> = {}): WritingPieceRow {
  return {
    id: overrides.id ?? autoId(),
    sessionId: 1,
    date: daysAgo(1),
    genre: 'ESSAY',
    wordCount: 240,
    minutes: 45,
    timed: true,
    rewriteOf: null,
    corrector: 'PROFESOR',
    bandContent: 3,
    bandCommunicative: 3,
    bandOrganisation: 3,
    bandLanguage: 3,
    ...overrides,
  };
}

export function makeDataset(partial: Partial<Dataset> = {}): Dataset {
  return {
    sessions: partial.sessions ?? [],
    errors: partial.errors ?? [],
    pieces: partial.pieces ?? [],
  };
}

/**
 * `n` errores identicos salvo el id, colgados de una sesion. Sirve para llegar a MIN_N
 * sin escribir quince literales.
 */
export function makeErrors(
  count: number,
  overrides: Partial<ErrorRow> = {},
): ErrorRow[] {
  return Array.from({ length: count }, () => makeError(overrides));
}
