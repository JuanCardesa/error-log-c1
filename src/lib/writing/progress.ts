import { GENRES, WRITING_CRITERIA, type Genre, type WritingCriterion, type WritingStatus } from '../domain/enums';

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

/** Medida de la gráfica y tipo de texto: se aplican al elegirlos y viven en la URL. */
export interface ProgressFilters {
  readonly metric: ProgressMetric;
  readonly genre: Genre | null;
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

/**
 * Lo que abre la vista. `weakest`: el criterio (o los empatados) con la media más baja;
 * `even`: los cuatro están a menos de `EVEN_SPREAD` y no hay uno que destaque; `none`: aún no
 * hay ninguna nota.
 */
export type ProgressFocus =
  | { readonly kind: 'none' }
  | { readonly kind: 'even'; readonly low: number; readonly high: number }
  | { readonly kind: 'weakest'; readonly criteria: readonly WritingCriterion[]; readonly mean: number };

export interface WritingProgress {
  readonly pieces: readonly ProgressPiece[];
  readonly points: readonly ProgressPoint[];
  /** Redacciones con al menos un criterio evaluado. */
  readonly assessed: number;
  readonly awaiting: number;
  readonly criteria: readonly CriterionProgress[];
  readonly focus: ProgressFocus;
  /** Algún criterio tiene menos de `MIN_CRITERION_N` notas: el titular es una orientación. */
  readonly smallSample: boolean;
}

/** Con menos notas por criterio, una media es una orientación y no un patrón. */
export const MIN_CRITERION_N = 3;
/** Por debajo de esta distancia entre la media más alta y la más baja, van parejos. */
export const EVEN_SPREAD = 0.5;

export const DEFAULT_PROGRESS_FILTERS: ProgressFilters = { metric: 'TOTAL', genre: null };

const validGenre = (value: string | undefined): Genre | null =>
  value !== undefined && (GENRES as readonly string[]).includes(value) ? value as Genre : null;

export function parseProgressFilters(params: Record<string, string | string[] | undefined>): ProgressFilters {
  const metric = params['measure'];
  return {
    metric: typeof metric === 'string' && (PROGRESS_METRICS as readonly string[]).includes(metric)
      ? metric as ProgressMetric : 'TOTAL',
    genre: validGenre(typeof params['type'] === 'string' ? params['type'] : undefined),
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

function focusOf(criteria: readonly CriterionProgress[]): ProgressFocus {
  const means = criteria.flatMap((item) => item.mean === null ? [] : [item.mean]);
  if (means.length === 0) return { kind: 'none' };
  const low = Math.min(...means);
  const high = Math.max(...means);
  // Con los cuatro evaluados y a menos de medio punto, ninguno va por detrás.
  if (means.length === criteria.length && high - low < EVEN_SPREAD) return { kind: 'even', low, high };
  return {
    kind: 'weakest',
    criteria: criteria.filter((item) => item.mean !== null && Math.abs(item.mean - low) < 1e-9).map((item) => item.criterion),
    mean: low,
  };
}

export function writingProgress(pieces: readonly ProgressPiece[], filters: ProgressFilters): WritingProgress {
  const selected = uniqueChronological(pieces).filter((piece) => filters.genre === null || piece.genre === filters.genre);
  const criteria = criterionProgress(selected);
  const points = selected.flatMap((piece) => {
    const value = valueFor(piece, filters.metric);
    return value === null ? [] : [{ id: piece.id, date: piece.date, dateBasis: piece.dateBasis, genre: piece.genre, value }];
  });

  return {
    pieces: selected,
    points,
    assessed: selected.filter((piece) => piece.status !== 'AWAITING'
      && WRITING_CRITERIA.some((criterion) => valueFor(piece, criterion) !== null)).length,
    awaiting: selected.filter((piece) => piece.status === 'AWAITING').length,
    criteria,
    focus: focusOf(criteria),
    smallSample: criteria.some((item) => item.mean !== null && item.count < MIN_CRITERION_N),
  };
}
