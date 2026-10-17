import { GENRES, WRITING_CRITERIA, type Genre, type WritingCriterion, type WritingStatus } from '../domain/enums';
import { isIsoDate } from '../time/dates';

export const PROGRESS_METRICS = ['TOTAL', ...WRITING_CRITERIA] as const;
export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

export interface ProgressPiece {
  readonly id: number;
  readonly date: string;
  readonly dateBasis: 'WRITTEN' | 'CORRECTED' | 'IMPORTED';
  readonly genre: Genre;
  readonly status: WritingStatus;
  readonly bandContent: number | null;
  readonly bandCommunicative: number | null;
  readonly bandOrganisation: number | null;
  readonly bandLanguage: number | null;
}

export interface ProgressFilters {
  readonly metric: ProgressMetric;
  readonly genre: Genre | null;
  readonly from: string | null;
  readonly to: string | null;
}

export interface ProgressPoint {
  readonly id: number;
  readonly date: string;
  readonly dateBasis: ProgressPiece['dateBasis'];
  readonly genre: Genre;
  readonly value: number;
}

export interface CriterionProgress {
  readonly criterion: WritingCriterion;
  readonly mean: number | null;
  readonly count: number;
  readonly last: number | null;
}

export interface WritingProgress {
  readonly pieces: readonly ProgressPiece[];
  readonly points: readonly ProgressPoint[];
  readonly count: number;
  readonly corrected: number;
  readonly awaiting: number;
  readonly criteria: readonly CriterionProgress[];
  readonly strongest: WritingCriterion | null;
  readonly mostRoomToImprove: WritingCriterion | null;
}

export const DEFAULT_PROGRESS_FILTERS: ProgressFilters = {
  metric: 'TOTAL', genre: null, from: null, to: null,
};

const validGenre = (value: string | undefined): Genre | null =>
  value !== undefined && (GENRES as readonly string[]).includes(value) ? value as Genre : null;

const validDate = (value: string | undefined): string | null =>
  value !== undefined && value !== '' && isIsoDate(value) ? value : null;

export function parseProgressFilters(params: Record<string, string | string[] | undefined>): ProgressFilters {
  const metric = params['measure'];
  return {
    metric: typeof metric === 'string' && (PROGRESS_METRICS as readonly string[]).includes(metric)
      ? metric as ProgressMetric : 'TOTAL',
    genre: validGenre(typeof params['type'] === 'string' ? params['type'] : undefined),
    from: validDate(typeof params['from'] === 'string' ? params['from'] : undefined),
    to: validDate(typeof params['to'] === 'string' ? params['to'] : undefined),
  };
}

function valueFor(piece: ProgressPiece, metric: ProgressMetric): number | null {
  if (metric === 'TOTAL') {
    const bands = [piece.bandContent, piece.bandCommunicative, piece.bandOrganisation, piece.bandLanguage];
    return bands.some((band) => band === null) ? null : bands.reduce<number>((total, band) => total + (band ?? 0), 0);
  }
  switch (metric) {
    case 'CONTENT': return piece.bandContent;
    case 'COMMUNICATIVE': return piece.bandCommunicative;
    case 'ORGANISATION': return piece.bandOrganisation;
    case 'LANGUAGE': return piece.bandLanguage;
  }
}

function uniqueChronological(pieces: readonly ProgressPiece[]): ProgressPiece[] {
  const byId = new Map<number, ProgressPiece>();
  for (const piece of pieces) byId.set(piece.id, piece);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function criterionProgress(pieces: readonly ProgressPiece[]): CriterionProgress[] {
  const assessed = pieces.filter((piece) => piece.status !== 'AWAITING');
  return WRITING_CRITERIA.map((criterion) => {
    const values = assessed.flatMap((piece) => {
      const value = valueFor(piece, criterion);
      return value === null ? [] : [{ date: piece.date, id: piece.id, value }];
    });
    const sum = values.reduce((total, item) => total + item.value, 0);
    return {
      criterion,
      mean: values.length === 0 ? null : sum / values.length,
      count: values.length,
      last: values.at(-1)?.value ?? null,
    };
  });
}

export function writingProgress(pieces: readonly ProgressPiece[], filters: ProgressFilters): WritingProgress {
  const selected = uniqueChronological(pieces).filter((piece) =>
    (filters.genre === null || piece.genre === filters.genre)
      && (filters.from === null || piece.date >= filters.from)
      && (filters.to === null || piece.date <= filters.to),
  );
  const criteria = criterionProgress(selected);
  const ranked = criteria.filter((item): item is CriterionProgress & { readonly mean: number } => item.mean !== null);
  const minimum = Math.min(...ranked.map((item) => item.mean));
  const maximum = Math.max(...ranked.map((item) => item.mean));
  const comparable = criteria.every((item) => item.count >= 3);
  const difference = comparable ? maximum - minimum : 0;
  const points = selected.flatMap((piece) => {
    const value = valueFor(piece, filters.metric);
    return value === null ? [] : [{ id: piece.id, date: piece.date, dateBasis: piece.dateBasis, genre: piece.genre, value }];
  });

  return {
    pieces: selected,
    points,
    count: selected.length,
    corrected: selected.filter((piece) => piece.status === 'CORRECTED').length,
    awaiting: selected.filter((piece) => piece.status === 'AWAITING').length,
    criteria,
    strongest: comparable && difference >= 0.5 ? ranked.find((item) => item.mean === maximum)?.criterion ?? null : null,
    mostRoomToImprove: comparable && difference >= 0.5 ? ranked.find((item) => item.mean === minimum)?.criterion ?? null : null,
  };
}
