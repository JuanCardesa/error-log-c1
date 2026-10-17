import type {
  AnnotationFocus,
  AnnotationKind,
  AnnotationScope,
  Corrector,
  Genre,
  WritingDateBasis,
  WritingStatus,
} from '../domain/enums';
import { studyAnchor, type StudyAnchor } from '../notebook/annotations';
import type { ImportedAnnotation, WritingImport } from './contract';
import { annotationImportKey, contentHash, textFingerprint } from './fingerprint';
import { locateQuote, type QuoteLocation } from './locate';
import { countWords, paragraphsOf, textSimilarity } from './text';

/**
 * Qué haría una importación, sin escribir nada: crear o actualizar, qué cambia, dónde va
 * cada anotación y qué impide seguir. La vista previa lo enseña y la confirmación lo vuelve
 * a calcular dentro de la transacción; si el resultado no coincide, algo cambió entre medias.
 * Reglas en docs/WRITING-PLAN.md §7.
 */

/** Desde aquí un texto parecido se ofrece como posible original. */
export const SUGGEST_SIMILARITY = 0.6;
/** Desde aquí se propone actualizarlo sin que haya que elegirlo. */
export const PRESELECT_SIMILARITY = 0.85;
const MAX_SUGGESTIONS = 3;

export interface StoredWriting {
  readonly id: number;
  readonly uid: string;
  readonly sessionId: number;
  readonly title: string | null;
  readonly genre: Genre;
  readonly date: string;
  readonly dateBasis: WritingDateBasis;
  readonly taskPrompt: string | null;
  readonly originalText: string | null;
  readonly textFingerprint: string | null;
  readonly wordCount: number | null;
  readonly wordMin: number | null;
  readonly wordMax: number | null;
  readonly timed: boolean;
  readonly minutes: number | null;
  readonly status: WritingStatus;
  readonly corrector: Corrector | null;
  readonly correctedOn: string | null;
  readonly bandContent: number | null;
  readonly bandCommunicative: number | null;
  readonly bandOrganisation: number | null;
  readonly bandLanguage: number | null;
  readonly teacherComment: string | null;
  readonly personalNotes: string | null;
  readonly updatedAt: string;
  readonly annotationIds: ReadonlySet<string>;
  readonly importKeys: ReadonlySet<string>;
}

/** Lo que una importación puede escribir en `writing_piece`. */
export interface PieceValues {
  readonly title: string | null;
  readonly genre: Genre;
  readonly date: string;
  readonly dateBasis: WritingDateBasis;
  readonly taskPrompt: string | null;
  readonly originalText: string | null;
  readonly textFingerprint: string | null;
  readonly wordCount: number | null;
  readonly wordMin: number | null;
  readonly wordMax: number | null;
  readonly timed: boolean;
  readonly minutes: number | null;
  readonly status: WritingStatus;
  readonly corrector: Corrector | null;
  readonly correctedOn: string | null;
  readonly bandContent: number | null;
  readonly bandCommunicative: number | null;
  readonly bandOrganisation: number | null;
  readonly bandLanguage: number | null;
  readonly teacherComment: string | null;
  readonly personalNotes: string | null;
}

export type PieceField = keyof PieceValues;
type FieldValue = string | number | boolean | null;

export interface FieldChange {
  readonly field: PieceField;
  readonly before: FieldValue;
  readonly after: FieldValue;
}

/** Derivados de otro campo: cambian con él y no se enseñan aparte. */
const DERIVED: ReadonlySet<PieceField> = new Set(['textFingerprint', 'wordCount', 'dateBasis']);

export type ImportDecision = { readonly mode: 'create' } | { readonly mode: 'update'; readonly uid: string };

export interface AnnotationRow {
  /** El de la exportación, si llega; si no (o si ya está usado), lo pone quien escribe. */
  readonly id: string | null;
  readonly kind: AnnotationKind;
  readonly focus: AnnotationFocus | null;
  readonly source: Corrector;
  readonly scope: AnnotationScope;
  readonly anchor: StudyAnchor | null;
  readonly paragraph: number | null;
  readonly quote: string | null;
  readonly comment: string | null;
  readonly suggestion: string | null;
  readonly reviewedAt: string | null;
  readonly importKey: string;
}

export type AnnotationOutcome = 'placed' | 'loose' | 'unplaced' | 'paragraph' | 'document' | 'duplicate';

export interface AnnotationPlan {
  /** Posición en el array del JSON. */
  readonly index: number;
  readonly outcome: AnnotationOutcome;
  /** Para citas: lo que encontró la búsqueda, también cuando no se pudo colocar. */
  readonly location: QuoteLocation | null;
  /** Nulo si ya estaba importada. */
  readonly row: AnnotationRow | null;
}

export interface Suggestion {
  readonly uid: string;
  readonly title: string | null;
  readonly date: string;
  readonly similarity: number;
}

export type PlanWarning =
  | { readonly code: 'totalMismatch'; readonly total: number; readonly sum: number }
  | { readonly code: 'totalIncomplete'; readonly total: number }
  | { readonly code: 'textDiffers'; readonly similarity: number }
  | { readonly code: 'dateFallback'; readonly basis: 'CORRECTED' | 'IMPORTED'; readonly date: string };

export type PlanError =
  | { readonly code: 'targetMissing' }
  | { readonly code: 'paragraphOutOfRange'; readonly index: number; readonly paragraph: number; readonly paragraphs: number }
  | { readonly code: 'correctedBeforeWritten'; readonly date: string; readonly correctedOn: string };

export interface WritingImportPlan {
  readonly decision: ImportDecision;
  /** Cómo se reconoció la redacción que se actualiza. */
  readonly matchedBy: 'id' | 'fingerprint' | 'similarity' | null;
  readonly target: StoredWriting | null;
  /** Textos guardados parecidos, para elegir otro destino en la vista previa. */
  readonly suggestions: readonly Suggestion[];
  /** Al crear: el id de la exportación, si aquí no existe. */
  readonly keepUid: string | null;
  /** El texto sobre el que se anclan las anotaciones: el guardado, si lo hay. */
  readonly text: string;
  /** Cómo queda la redacción después de importar. */
  readonly values: PieceValues;
  /** Al actualizar, solo lo que cambia. */
  readonly patch: Partial<PieceValues>;
  readonly changes: readonly FieldChange[];
  /** No se sabe cuándo se escribió y nadie lo ha dicho todavía. */
  readonly needsDate: boolean;
  readonly annotations: readonly AnnotationPlan[];
  readonly warnings: readonly PlanWarning[];
  readonly errors: readonly PlanError[];
  readonly nothingToDo: boolean;
}

export interface PlanOptions {
  readonly today: string;
  /** Sin ella se elige sola; con ella manda lo que eligió la persona en la vista previa. */
  readonly decision?: ImportDecision;
  /**
   * Fecha de escritura dicha en la vista previa cuando el JSON no la trae. `null` es «no la
   * sé»; sin definir, todavía no se ha preguntado.
   */
  readonly writtenOn?: string | null;
}

interface Target {
  readonly decision: ImportDecision;
  readonly matchedBy: WritingImportPlan['matchedBy'];
  readonly target: StoredWriting | null;
  readonly keepUid: string | null;
  readonly missing: boolean;
}

function chooseTarget(data: WritingImport, stored: readonly StoredWriting[], suggestions: readonly Suggestion[],
  decision: ImportDecision | undefined): Target {
  const { id } = data.writing;
  const byUid = id === null ? undefined : stored.find((piece) => piece.uid === id);
  const keepUid = byUid === undefined ? id : null;
  const fingerprint = textFingerprint(data.writing.text);
  const matchedBy = (piece: StoredWriting): Target['matchedBy'] => (piece === byUid ? 'id'
    : piece.textFingerprint === fingerprint ? 'fingerprint' : 'similarity');

  if (decision?.mode === 'create') return { decision, matchedBy: null, target: null, keepUid, missing: false };
  if (decision?.mode === 'update') {
    const target = stored.find((piece) => piece.uid === decision.uid);
    return target === undefined
      ? { decision, matchedBy: null, target: null, keepUid: null, missing: true }
      : { decision, matchedBy: matchedBy(target), target, keepUid: null, missing: false };
  }
  const exact = byUid ?? stored.find((piece) => piece.textFingerprint === fingerprint);
  const similar = suggestions[0];
  const target = exact ?? (similar !== undefined && similar.similarity >= PRESELECT_SIMILARITY
    ? stored.find((piece) => piece.uid === similar.uid) : undefined);
  return target === undefined
    ? { decision: { mode: 'create' }, matchedBy: null, target: null, keepUid, missing: false }
    : { decision: { mode: 'update', uid: target.uid }, matchedBy: matchedBy(target), target, keepUid: null, missing: false };
}

function suggestionsFor(data: WritingImport, stored: readonly StoredWriting[]): Suggestion[] {
  return stored
    .flatMap((piece) => (piece.originalText === null || piece.genre !== data.writing.type ? [] : [{
      uid: piece.uid, title: piece.title, date: piece.date,
      similarity: textSimilarity(piece.originalText, data.writing.text),
    }]))
    .filter((suggestion) => suggestion.similarity >= SUGGEST_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity || b.date.localeCompare(a.date))
    .slice(0, MAX_SUGGESTIONS);
}

function planAnnotation(annotation: ImportedAnnotation, index: number, text: string, importKey: string): AnnotationPlan {
  const base = {
    id: annotation.id, kind: annotation.kind, focus: annotation.focus, source: annotation.source,
    scope: annotation.target.scope, comment: annotation.comment, suggestion: annotation.suggestion,
    reviewedAt: annotation.reviewedAt, importKey,
  };
  const { target } = annotation;
  if (target.scope === 'DOCUMENT') {
    return { index, outcome: 'document', location: null, row: { ...base, anchor: null, paragraph: null, quote: null } };
  }
  if (target.scope === 'PARAGRAPH') {
    return { index, outcome: 'paragraph', location: null,
      row: { ...base, anchor: null, paragraph: target.paragraph, quote: null } };
  }
  const location = locateQuote(text, target);
  if (location.status === 'placed') {
    return { index, outcome: location.loose ? 'loose' : 'placed', location,
      row: { ...base, anchor: studyAnchor(text, location.start, location.end), paragraph: null, quote: target.quote } };
  }
  // Sin colocar: se guarda la cita y el párrafo esperado para elegir el sitio a mano.
  return { index, outcome: 'unplaced', location,
    row: { ...base, anchor: null, paragraph: target.paragraph, quote: target.quote } };
}

const nonNull = <T>(value: T | null): value is T => value !== null;

export function buildWritingImportPlan(data: WritingImport, stored: readonly StoredWriting[], options: PlanOptions): WritingImportPlan {
  const suggestions = suggestionsFor(data, stored);
  const chosen = chooseTarget(data, stored, suggestions, options.decision);
  const { target } = chosen;
  const errors: PlanError[] = chosen.missing ? [{ code: 'targetMissing' }] : [];
  const warnings: PlanWarning[] = [];
  const incoming = data.writing;
  const assessment = data.assessment;

  // El texto guardado manda: lo escrito no se sustituye al reimportar.
  const text = target?.originalText ?? incoming.text;
  if (target?.originalText != null && target.originalText !== incoming.text) {
    warnings.push({ code: 'textDiffers', similarity: textSimilarity(target.originalText, incoming.text) });
  }

  const paragraphs = paragraphsOf(text).length;
  data.annotations.forEach((annotation, index) => {
    const paragraph = annotation.target.scope === 'DOCUMENT' ? null : annotation.target.paragraph;
    if (paragraph !== null && paragraph > paragraphs) errors.push({ code: 'paragraphOutOfRange', index, paragraph, paragraphs });
  });

  const seen = new Set(target?.importKeys);
  const annotations = data.annotations.map((annotation, index): AnnotationPlan => {
    const key = annotationImportKey(annotation);
    const repeated = seen.has(key) || (annotation.id !== null && target?.annotationIds.has(annotation.id) === true);
    seen.add(key);
    if (repeated) return { index, outcome: 'duplicate', location: null, row: null };
    return planAnnotation(annotation, index, text, key);
  });
  const added = annotations.map((item) => item.row).filter(nonNull);

  const scores = {
    bandContent: assessment?.scores?.content ?? null,
    bandCommunicative: assessment?.scores?.communicativeAchievement ?? null,
    bandOrganisation: assessment?.scores?.organisation ?? null,
    bandLanguage: assessment?.scores?.language ?? null,
  };
  const given = Object.values(scores).filter(nonNull);
  if (assessment?.total != null) {
    const sum = given.reduce((total, value) => total + value, 0);
    if (given.length < 4) warnings.push({ code: 'totalIncomplete', total: assessment.total });
    else if (sum !== assessment.total) warnings.push({ code: 'totalMismatch', total: assessment.total, sum });
  }
  // Unas notas de la IA no corrigen un texto: quien corrige es la profesora o uno mismo.
  const marked = (given.length > 0 && assessment?.assessedBy !== 'IA') || assessment?.assessedBy === 'PROFESOR'
    || added.some((row) => row.source === 'PROFESOR');

  const hasRecordedDate = incoming.recordedDate !== undefined && incoming.dateBasis !== undefined;
  const written = incoming.writtenOn ?? (typeof options.writtenOn === 'string' ? options.writtenOn : null);
  const correctedOn = assessment?.correctedOn ?? target?.correctedOn ?? null;
  const dated = ((): Pick<PieceValues, 'date' | 'dateBasis'> => {
    if (hasRecordedDate) return { date: incoming.recordedDate!, dateBasis: incoming.dateBasis! };
    if (written !== null) return { date: written, dateBasis: 'WRITTEN' };
    if (target !== null && target.dateBasis === 'WRITTEN') return { date: target.date, dateBasis: 'WRITTEN' };
    if (correctedOn !== null) return { date: correctedOn, dateBasis: 'CORRECTED' };
    return target === null ? { date: options.today, dateBasis: 'IMPORTED' } : { date: target.date, dateBasis: target.dateBasis };
  })();
  if (dated.dateBasis !== 'WRITTEN') warnings.push({ code: 'dateFallback', basis: dated.dateBasis, date: dated.date });
  const needsDate = !hasRecordedDate && dated.dateBasis !== 'WRITTEN' && options.writtenOn === undefined;

  // Al actualizar: lo descriptivo (título, enunciado, notas propias) solo rellena huecos, para
  // no pisar lo retocado a mano; la evaluación y los datos de la tarea se sustituyen si llegan.
  const keep = <T>(value: T | null, current: T | null): T | null => current ?? value;
  const replace = <T>(value: T | null, current: T | null): T | null => value ?? current;
  const textValues = target?.originalText != null
    ? { originalText: target.originalText, textFingerprint: target.textFingerprint, wordCount: countWords(target.originalText) }
    : { originalText: incoming.text, textFingerprint: textFingerprint(incoming.text), wordCount: countWords(incoming.text) };
  const values: PieceValues = {
    title: target === null ? incoming.title : keep(incoming.title, target.title),
    genre: incoming.type,
    ...dated,
    taskPrompt: target === null ? incoming.taskPrompt : keep(incoming.taskPrompt, target.taskPrompt),
    ...textValues,
    wordMin: replace(incoming.wordRange?.[0] ?? null, target?.wordMin ?? null),
    wordMax: replace(incoming.wordRange?.[1] ?? null, target?.wordMax ?? null),
    timed: incoming.timed ?? target?.timed ?? false,
    minutes: replace(incoming.minutes, target?.minutes ?? null),
    status: assessment?.status ?? (marked ? 'CORRECTED' : target?.status ?? 'AWAITING'),
    corrector: replace(assessment?.assessedBy ?? null, target?.corrector ?? null),
    correctedOn,
    bandContent: replace(scores.bandContent, target?.bandContent ?? null),
    bandCommunicative: replace(scores.bandCommunicative, target?.bandCommunicative ?? null),
    bandOrganisation: replace(scores.bandOrganisation, target?.bandOrganisation ?? null),
    bandLanguage: replace(scores.bandLanguage, target?.bandLanguage ?? null),
    teacherComment: replace(assessment?.teacherComment ?? null, target?.teacherComment ?? null),
    personalNotes: target === null ? assessment?.personalNotes ?? null
      : keep(assessment?.personalNotes ?? null, target.personalNotes),
  };
  if (values.correctedOn !== null && values.correctedOn < values.date) {
    errors.push({ code: 'correctedBeforeWritten', date: values.date, correctedOn: values.correctedOn });
  }

  const patch: Partial<Record<PieceField, FieldValue>> = {};
  const changes: FieldChange[] = [];
  if (target !== null) {
    for (const field of Object.keys(values) as PieceField[]) {
      const before = (target as unknown as Record<PieceField, FieldValue>)[field] ?? null;
      const after = values[field];
      if (before === after) continue;
      patch[field] = after;
      if (!DERIVED.has(field)) changes.push({ field, before, after });
    }
  }

  return {
    decision: chosen.decision, matchedBy: chosen.matchedBy, target, suggestions, keepUid: chosen.keepUid,
    text, values, patch: patch as Partial<PieceValues>, changes, needsDate, annotations, warnings, errors,
    nothingToDo: target !== null && Object.keys(patch).length === 0 && added.length === 0,
  };
}

/**
 * Resumen de lo que decide el plan. La confirmación lo recalcula dentro de la transacción:
 * si no coincide con el de la vista previa, la redacción cambió y hay que revisarla otra vez.
 */
export function planDigest(plan: WritingImportPlan): string {
  return contentHash({
    decision: plan.decision,
    target: plan.target === null ? null : [plan.target.uid, plan.target.updatedAt, [...plan.target.importKeys].sort()],
    keepUid: plan.keepUid,
    values: plan.values,
    annotations: plan.annotations.map((item) => [item.outcome, item.row]),
  });
}
