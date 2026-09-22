import type { AnkiCard, AnkiNote, AnkiReview } from './api';
import { AnkiError } from './connect';
import { categoryOf } from './categories';
import type { AnkiDataset } from '../domain/types';
import { ankiDay, type Rollover } from './schedule';

export interface AnkiSnapshot {
  readonly cards: readonly AnkiCard[];
  readonly notes: readonly AnkiNote[];
  readonly reviews: Readonly<Record<string, readonly AnkiReview[]>>;
  readonly missingNoteIds: readonly number[];
}

/** Las etiquetas se muestran como texto, jamás como HTML de la colección. */
export function noteLabel(note: AnkiNote): string {
  const field = note.fields['Prompt'] ?? Object.values(note.fields).sort((a, b) => a.order - b.order)[0];
  return (field?.value ?? '').replace(/<[^>]*>/g, ' ').replace(/\[sound:[^\]]*\]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 300) || `Nota ${String(note.noteId)}`;
}

/** Snapshot completo por carta: incluye importaciones antiguas y elimina repasos deshechos. */
export interface AnkiReconciliation extends Omit<AnkiDataset, 'sync'> {
  readonly missingNoteIds: readonly number[];
  readonly newReviews: number;
  /** El corte con el que se han fechado estos repasos, y de donde salio. */
  readonly rollover: Rollover;
}

export function reconcile(snapshot: AnkiSnapshot, current: AnkiDataset, now: Date, rollover: Rollover): AnkiReconciliation {
  const oldNotes = new Map(current.notes.map((note) => [note.noteId, note]));
  const cards = snapshot.cards.map((card) => ({
    cardId: card.cardId, noteId: card.note, deck: card.deckName, templateOrd: card.ord,
    lapses: card.lapses, reps: card.reps, queue: card.queue, intervalDays: card.interval,
  }));
  const notes = snapshot.notes.map((note) => ({
    noteId: note.noteId, model: note.modelName, label: noteLabel(note), tags: note.tags,
    category: categoryOf(note.tags), firstSeenAt: oldNotes.get(note.noteId)?.firstSeenAt ?? now.toISOString(),
    lastSeenAt: now.toISOString(),
  }));
  const reviews: AnkiDataset['reviews'][number][] = [];
  const seen = new Set<number>();
  for (const card of cards) {
    if (!notes.some((note) => note.noteId === card.noteId)) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Falta la nota de una tarjeta; repite la sincronización.');
    for (const review of snapshot.reviews[String(card.cardId)] ?? []) {
      // 4 = manual; 5 = reprogramación. Solo 1..4 son botones de un repaso real.
      if (review.type < 0 || review.type > 3 || review.ease < 1 || review.ease > 4) continue;
      if (seen.has(review.id) || Number.isNaN(new Date(review.id).getTime())) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Identificador de repaso inválido o repetido.');
      seen.add(review.id);
      reviews.push({
        reviewId: review.id, cardId: card.cardId, reviewedAt: new Date(review.id).toISOString(),
        reviewDate: ankiDay(new Date(review.id), rollover.hour), ease: review.ease, interval: review.ivl,
        lastInterval: review.lastIvl, factor: review.factor, timeMs: review.time, type: review.type,
      });
    }
  }
  const oldIds = new Set(current.reviews.map((review) => review.reviewId));
  return { notes, cards, reviews, missingNoteIds: snapshot.missingNoteIds, rollover,
    newReviews: reviews.filter((review) => !oldIds.has(review.reviewId)).length };
}
