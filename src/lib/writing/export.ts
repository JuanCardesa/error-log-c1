import type { WritingRow } from '../db/writingRepo';
import type { writingAnnotation } from '../db/schema';
import type { AnnotationFocus, AnnotationKind, Corrector, Genre, WritingDateBasis, WritingStatus } from '../domain/enums';
import type { StudyAnchor } from '../notebook/annotations';
import { WRITING_EXPORT_VERSION, WRITING_FORMAT } from './contract';

export interface WritingJsonAnnotation {
  readonly id: string;
  readonly kind: AnnotationKind;
  readonly focus: AnnotationFocus | null;
  readonly source: Corrector;
  readonly target:
    | { readonly scope: 'DOCUMENT' }
    | { readonly scope: 'PARAGRAPH'; readonly paragraph: number }
    | {
      readonly scope: 'SPAN'; readonly quote: string; readonly paragraph?: number; readonly start?: number; readonly end?: number;
    };
  readonly comment: string | null;
  readonly suggestion: string | null;
  readonly reviewedAt: string | null;
}

export interface WritingJsonExport {
  readonly format: typeof WRITING_FORMAT;
  readonly version: typeof WRITING_EXPORT_VERSION;
  readonly writing: {
    readonly id: string;
    readonly title: string;
    readonly type: Genre;
    readonly writtenOn: string | null;
    readonly recordedDate: string;
    readonly dateBasis: WritingDateBasis;
    readonly taskPrompt: string | null;
    readonly text: string;
    readonly wordRange: readonly [number, number] | null;
    readonly timed: boolean;
    readonly minutes: number | null;
  };
  readonly assessment: {
    readonly status: WritingStatus;
    readonly assessedBy: Corrector | null;
    readonly correctedOn: string | null;
    readonly scores: {
      readonly content: number | null;
      readonly communicativeAchievement: number | null;
      readonly organisation: number | null;
      readonly language: number | null;
    };
    readonly total: number | null;
    readonly teacherComment: string | null;
    readonly personalNotes: string | null;
  };
  readonly annotations: readonly WritingJsonAnnotation[];
}

type WritingAnnotationRow = typeof writingAnnotation.$inferSelect;

function validAnchor(anchor: StudyAnchor | null, text: string): StudyAnchor | null {
  return anchor !== null && text.slice(anchor.start, anchor.end) === anchor.exact ? anchor : null;
}

function exportAnnotation(row: WritingAnnotationRow, text: string): WritingJsonAnnotation {
  let target: WritingJsonAnnotation['target'];
  if (row.scope === 'DOCUMENT') {
    target = { scope: 'DOCUMENT' };
  } else if (row.scope === 'PARAGRAPH') {
    if (row.paragraph === null) throw new Error(`Anotación ${row.id} sin número de párrafo`);
    target = { scope: 'PARAGRAPH', paragraph: row.paragraph };
  } else {
    const anchor = validAnchor(row.anchor, text);
    const quote = anchor?.exact ?? row.quote;
    if (quote === null) throw new Error(`Anotación ${row.id} sin cita para exportar`);
    target = {
      scope: 'SPAN', quote,
      ...(row.paragraph === null ? {} : { paragraph: row.paragraph }),
      ...(anchor === null ? {} : { start: anchor.start, end: anchor.end }),
    };
  }
  return {
    id: row.id, kind: row.kind, focus: row.focus, source: row.source, target,
    comment: row.comment, suggestion: row.suggestion, reviewedAt: row.reviewedAt,
  };
}

export function toWritingJson(
  piece: WritingRow,
  title: string,
  annotations: readonly WritingAnnotationRow[],
): WritingJsonExport {
  if (piece.originalText === null) throw new Error('No se exportan redacciones sin transcripción');
  const text = piece.originalText;
  const bands = [piece.bandContent, piece.bandCommunicative, piece.bandOrganisation, piece.bandLanguage];
  const total = bands.some((band) => band === null) ? null : bands.reduce<number>((sum, band) => sum + (band ?? 0), 0);
  const wordRange = piece.wordMin === null || piece.wordMax === null ? null : [piece.wordMin, piece.wordMax] as const;
  return {
    format: WRITING_FORMAT,
    version: WRITING_EXPORT_VERSION,
    writing: {
      id: piece.uid, title, type: piece.genre,
      writtenOn: piece.dateBasis === 'WRITTEN' ? piece.date : null,
      recordedDate: piece.date, dateBasis: piece.dateBasis,
      taskPrompt: piece.taskPrompt, text, wordRange, timed: piece.timed, minutes: piece.minutes,
    },
    assessment: {
      status: piece.status, assessedBy: piece.corrector, correctedOn: piece.correctedOn,
      scores: {
        content: piece.bandContent, communicativeAchievement: piece.bandCommunicative,
        organisation: piece.bandOrganisation, language: piece.bandLanguage,
      },
      total, teacherComment: piece.teacherComment, personalNotes: piece.personalNotes,
    },
    annotations: annotations.map((row) => exportAnnotation(row, text)),
  };
}
