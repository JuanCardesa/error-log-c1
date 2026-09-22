import { expect, it } from 'vitest';
import { EMPTY_ANKI_DATASET } from '../domain/types';
import { noteLabel, reconcile } from './reconcile';
import { card, note, review, NOW, REVIEW, ankiFixture } from './fixtures/build';
import { ankiDay } from './schedule';

/** Corte a medianoche: estos casos miran otra cosa y asi la fecha es la civil. */
const ROLLOVER = { hour: 0, source: 'config' } as const;

it('conserva intervalos negativos y agrupa varios cloze en una misma nota', () => {
  const plan = reconcile({ cards: [card(), card({ cardId: 11, ord: 1 })], notes: [note()], reviews: { '10': [review()], '11': [review({ id: REVIEW + 1, ease: 3 })] }, missingNoteIds: [] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER);
  expect(plan.cards).toHaveLength(2);
  expect(plan.notes).toHaveLength(1);
  expect(plan.reviews[0]).toMatchObject({ interval: -60, reviewDate: ankiDay(new Date(REVIEW), ROLLOVER.hour) });
});
it('ignora manual, rescheduled y entradas sin botón real', () => {
  const plan = reconcile({ cards: [card()], notes: [note()], reviews: { '10': [review({ type: 4 }), review({ type: 5 }), review({ ease: 0 }), review({ ease: 5 }), review({ type: -1 })] }, missingNoteIds: [] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER);
  expect(plan.reviews).toEqual([]);
});
it('incluye repasos importados anteriores al último conocido y es idempotente', () => {
  const current = ankiFixture();
  const snapshot = { cards: [card()], notes: [note()], reviews: { '10': [review(), review({ id: REVIEW - 86400000 })] }, missingNoteIds: [] };
  const plan = reconcile(snapshot, current, NOW, ROLLOVER);
  expect(plan.newReviews).toBe(1);
  expect(reconcile(snapshot, { ...plan, sync: null }, NOW, ROLLOVER).newReviews).toBe(0);
  expect(plan.notes[0]?.firstSeenAt).toBe(current.notes[0]?.firstSeenAt);
});
it('rechaza notas ausentes y colisiones de identificadores', () => {
  expect(() => reconcile({ cards: [card()], notes: [], reviews: {}, missingNoteIds: [] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER)).toThrow('Falta la nota');
  expect(() => reconcile({ cards: [card()], notes: [note()], reviews: { '10': [review(), review()] }, missingNoteIds: [] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER)).toThrow('repetido');
  expect(() => reconcile({ cards: [card()], notes: [note()], reviews: { '10': [review({ id: Number.MAX_SAFE_INTEGER })] }, missingNoteIds: [] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER)).toThrow('inválido');
});
it('permite cartas sin repasos y conserva las notas declaradas ausentes', () => {
  expect(reconcile({ cards: [card()], notes: [note()], reviews: {}, missingNoteIds: [99] }, EMPTY_ANKI_DATASET, NOW, ROLLOVER)).toMatchObject({ reviews: [], missingNoteIds: [99] });
});
it('produce etiquetas de texto con el primer campo real, sin ejecutar HTML', () => {
  expect(noteLabel(note({ fields: { Last: { value: 'last', order: 1 }, First: { value: '<b>front</b> [sound:x.mp3]', order: 0 } } }))).toBe('front');
  expect(noteLabel(note({ fields: {} }))).toBe('Nota 20');
});
