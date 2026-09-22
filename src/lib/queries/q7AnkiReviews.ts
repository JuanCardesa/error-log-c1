import type { Category } from '../domain/enums';
import { EMPTY_ANKI_DATASET, type AnkiDataset, type Dataset, type QueryOptions } from '../domain/types';
import { toCsv } from '../csv/csv';
import { inWindow } from '../time/dates';
import { percentage, sliceWindow } from './window';

export function q7AnkiReviews(data: AnkiDataset = EMPTY_ANKI_DATASET, options: QueryOptions) {
  const notes = new Map(data.notes.map((note) => [note.noteId, note]));
  const cards = new Map(data.cards.map((card) => [card.cardId, card]));
  const groups = new Map<Category | null, { category: Category | null; reviews: number; failures: number; cards: Set<number>; notes: Map<number, { noteId: number; label: string; failures: number }> }>();
  const touched = new Set<number>();
  let reviews = 0;
  let failures = 0;
  for (const review of data.reviews) {
    if (!inWindow(review.reviewDate, options.now, options.windowDays)) continue;
    const card = cards.get(review.cardId);
    const note = card === undefined ? undefined : notes.get(card.noteId);
    if (!note) continue;
    reviews += 1;
    touched.add(review.cardId);
    let group = groups.get(note.category);
    if (group === undefined) {
      group = { category: note.category, reviews: 0, failures: 0, cards: new Set(), notes: new Map() };
      groups.set(note.category, group);
    }
    group.reviews += 1;
    group.cards.add(review.cardId);
    if (review.ease === 1) {
      failures += 1;
      group.failures += 1;
      const failed = group.notes.get(note.noteId) ?? { noteId: note.noteId, label: note.label, failures: 0 };
      failed.failures += 1;
      group.notes.set(note.noteId, failed);
    }
  }
  return {
    reviews, failures, correct: reviews - failures, distinctCards: touched.size,
    accuracy: reviews === 0 ? null : percentage(reviews - failures, reviews),
    groups: [...groups.values()].map((group) => ({
      category: group.category, reviews: group.reviews, failures: group.failures,
      distinctCards: group.cards.size, accuracy: percentage(group.reviews - group.failures, group.reviews),
      notes: [...group.notes.values()].sort((a, b) => b.failures - a.failures || a.noteId - b.noteId),
    })).sort((a, b) => b.failures - a.failures || (a.category ?? '').localeCompare(b.category ?? '')),
  };
}

export function compareAnkiPractice(data: Dataset, anki: AnkiDataset, options: QueryOptions) {
  const counts = new Map<Category | null, number>();
  for (const error of sliceWindow(data, options.now, options.windowDays).errors) {
    counts.set(error.category, (counts.get(error.category) ?? 0) + 1);
  }
  const reviews = new Map(q7AnkiReviews(anki, options).groups.map((group) => [group.category, group]));
  return [...new Set([...counts.keys(), ...reviews.keys()])].map((category) => ({
    category, practiceErrors: counts.get(category) ?? 0,
    ankiFailures: reviews.get(category)?.failures ?? 0, ankiReviews: reviews.get(category)?.reviews ?? 0,
  })).sort((a, b) => b.ankiFailures - a.ankiFailures || b.practiceErrors - a.practiceErrors);
}

export function q7ToCsv(result: ReturnType<typeof q7AnkiReviews>): string {
  return toCsv(['categoria', 'repasos', 'fallos', 'cartas_distintas', 'pct_aciertos'],
    result.groups.map((group) => [group.category ?? 'SIN_MAPEAR', group.reviews, group.failures, group.distinctCards, group.accuracy]));
}
