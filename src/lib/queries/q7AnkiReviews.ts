import type { Category } from '../domain/enums';
import { EMPTY_ANKI_DATASET, type AnkiDataset, type QueryOptions } from '../domain/types';
import { toCsv } from '../csv/csv';
import { inWindow } from '../time/dates';
import { percentage } from './window';

/**
 * Un «Again» no siempre es el mismo hecho.
 *
 * En una carta ya graduada (revlog tipo 1) significa que la sabías y se te ha ido: es un
 * lapso, y es lo único comparable con un error de práctica. En los pasos de aprendizaje
 * (tipo 0) o de reaprendizaje (tipo 2) significa que aún la estás montando, que es lo
 * normal con una tarjeta recién creada. Anki hace la misma distinción: su contador
 * `lapses` solo sube con el tipo 1. Mezclarlos inflaba los «fallos» justo cuando el log
 * está funcionando, que es cuando más tarjetas nuevas hay.
 */
const REVIEW_TYPE = 1;

export function q7AnkiReviews(data: AnkiDataset = EMPTY_ANKI_DATASET, options: QueryOptions) {
  const notes = new Map(data.notes.map((note) => [note.noteId, note]));
  const cards = new Map(data.cards.map((card) => [card.cardId, card]));
  const groups = new Map<Category | null, { category: Category | null; reviews: number; failures: number; lapses: number; cards: Set<number>; notes: Map<number, { noteId: number; label: string; failures: number }> }>();
  const touched = new Set<number>();
  let reviews = 0;
  let failures = 0;
  let lapses = 0;
  for (const review of data.reviews) {
    if (!inWindow(review.reviewDate, options.now, options.windowDays)) continue;
    const card = cards.get(review.cardId);
    const note = card === undefined ? undefined : notes.get(card.noteId);
    if (!note) continue;
    reviews += 1;
    touched.add(review.cardId);
    let group = groups.get(note.category);
    if (group === undefined) {
      group = { category: note.category, reviews: 0, failures: 0, lapses: 0, cards: new Set(), notes: new Map() };
      groups.set(note.category, group);
    }
    group.reviews += 1;
    group.cards.add(review.cardId);
    if (review.ease === 1) {
      failures += 1;
      group.failures += 1;
      if (review.type === REVIEW_TYPE) {
        lapses += 1;
        group.lapses += 1;
      }
      const failed = group.notes.get(note.noteId) ?? { noteId: note.noteId, label: note.label, failures: 0 };
      failed.failures += 1;
      group.notes.set(note.noteId, failed);
    }
  }
  return {
    reviews, failures, lapses, learningFailures: failures - lapses,
    correct: reviews - failures, distinctCards: touched.size,
    accuracy: reviews === 0 ? null : percentage(reviews - failures, reviews),
    groups: [...groups.values()].map((group) => ({
      category: group.category, reviews: group.reviews, failures: group.failures,
      lapses: group.lapses, learningFailures: group.failures - group.lapses,
      distinctCards: group.cards.size, accuracy: percentage(group.reviews - group.failures, group.reviews),
      notes: [...group.notes.values()].sort((a, b) => b.failures - a.failures || a.noteId - b.noteId),
    })).sort((a, b) => b.failures - a.failures || (a.category ?? '').localeCompare(b.category ?? '')),
  };
}

export function q7ToCsv(result: ReturnType<typeof q7AnkiReviews>): string {
  return toCsv(['categoria', 'repasos', 'fallos', 'lapsos', 'fallos_aprendiendo', 'cartas_distintas', 'pct_aciertos'],
    result.groups.map((group) => [group.category ?? 'SIN_MAPEAR', group.reviews, group.failures,
      group.lapses, group.learningFailures, group.distinctCards, group.accuracy]));
}
