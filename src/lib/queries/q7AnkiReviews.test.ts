import { expect, it } from 'vitest';
import { q7AnkiReviews, q7ToCsv } from './q7AnkiReviews';
import { EMPTY_ANKI_DATASET } from '../domain/types';
import { ankiFixture, NOW } from '../anki/fixtures/build';
import { makeDataset, makeError } from './fixtures/build';
import { toCsvExport, toJsonDump } from '../export/dump';

const options = { now: NOW, windowDays: 30 };
it('cuenta repasos y cartas distintas por separado, incluyendo Hard como acierto', () => {
  const data = ankiFixture();
  const base = data.reviews[0]!;
  const snapshot = { ...data, reviews: [base, { ...base, reviewId: base.reviewId + 1, ease: 2 }, { ...base, reviewId: base.reviewId + 2, ease: 4 }] };
  const result = q7AnkiReviews(snapshot, options, []);
  expect(result).toMatchObject({ reviews: 3, failures: 1, correct: 2, accuracy: 66.7, distinctCards: 1 });
  expect(result.groups[0]).toMatchObject({ category: 'PHRASAL_VERB', reviews: 3, failures: 1, distinctCards: 1, notes: [{ noteId: 20, label: 'deal with', failures: 1 }] });
});
it('compara 30/60 días, excluye futuro y conserva n/a sin repasos', () => {
  const data = ankiFixture();
  const snapshot = { ...data, reviews: [{ ...data.reviews[0]!, reviewDate: '2026-08-01' }, { ...data.reviews[0]!, reviewDate: '2026-09-23' }] };
  expect(q7AnkiReviews(snapshot, options, []).accuracy).toBeNull();
  expect(q7AnkiReviews(snapshot, { ...options, windowDays: 60 }, []).reviews).toBe(1);
  expect(q7AnkiReviews(EMPTY_ANKI_DATASET, options, []).reviews).toBe(0);
});
it('agrupa cloze sin duplicar notas y ordena primero las más falladas', () => {
  const data = ankiFixture();
  const c = data.cards[0]!; const n = data.notes[0]!; const r = data.reviews[0]!;
  const snapshot = { ...data,
    cards: [c, { ...c, cardId: 11 }, { ...c, cardId: 12, noteId: 21 }, { ...c, cardId: 13, noteId: 22 }],
    notes: [n, { ...n, noteId: 21, label: 'Another' }, { ...n, noteId: 22, category: null }],
    reviews: [r, { ...r, cardId: 11 }, { ...r, cardId: 12 }, { ...r, cardId: 13 }],
  };
  const result = q7AnkiReviews(snapshot, options, []);
  expect(result.distinctCards).toBe(4);
  expect(result.groups[0]?.notes).toEqual([{ noteId: 20, label: 'deal with', failures: 2 }, { noteId: 21, label: 'Another', failures: 1 }]);
  expect(result.groups[1]?.category).toBeNull();
  expect(q7ToCsv(result)).toContain('SIN_MAPEAR');
});
it('no cuenta referencias huérfanas y desempata categorías de forma determinista', () => {
  const data = ankiFixture(); const r = data.reviews[0]!; const n = data.notes[0]!; const c = data.cards[0]!;
  const snapshot = { ...data,
    cards: [c, { ...c, cardId: 11, noteId: 21 }, { ...c, cardId: 12, noteId: 22 }],
    notes: [n, { ...n, noteId: 21, category: null }],
    reviews: [r, { ...r, cardId: 11 }, { ...r, cardId: 12 }, { ...r, cardId: 99 }],
  };
  expect(q7AnkiReviews(snapshot, options, []).reviews).toBe(2);
  expect(q7AnkiReviews(snapshot, options, []).groups.map((group) => group.category)).toEqual([null, 'PHRASAL_VERB']);
});
it('agrupa una nota vinculada por la categoria de su error, no por su etiqueta', () => {
  // La nota 20 llega de Anki etiquetada PHRASAL_VERB. Si corriges el error a COLOCACION,
  // actualizar la tarjeta reescribe campos pero nunca tags: sin resolverlo aqui, Q7
  // seguiria contando ese fallo bajo la categoria vieja para siempre.
  const anki = ankiFixture();
  const linked = [makeError({ ankiNoteId: 20, ankiAdded: true, category: 'COLOCACION' })];

  expect(q7AnkiReviews(anki, options, []).groups[0]?.category).toBe('PHRASAL_VERB');
  expect(q7AnkiReviews(anki, options, linked).groups[0]).toMatchObject({
    category: 'COLOCACION', failures: 1, notes: [{ noteId: 20, label: 'deal with', failures: 1 }],
  });
});
it('no toca la categoria de una nota que no es de ningun error del log', () => {
  const anki = ankiFixture();
  // Un error del log sin vincular no puede reetiquetar una nota que no es suya.
  const unrelated = [makeError({ ankiNoteId: null, category: 'COLOCACION' })];
  expect(q7AnkiReviews(anki, options, unrelated).groups[0]?.category).toBe('PHRASAL_VERB');
});
it('exporta el historial sin perder campos y CSV sin inventar una tasa vacía', () => {
  const anki = ankiFixture(); const practice = makeDataset();
  const dump = toJsonDump(practice, NOW, anki);
  expect(dump.anki).toEqual(anki);
  expect(q7AnkiReviews(anki, options, []).failures).toBe(1);
  expect(toCsvExport('q7', practice, options, anki)).toContain('PHRASAL_VERB,1,1,1,0,1,0');
  expect(q7ToCsv(q7AnkiReviews(EMPTY_ANKI_DATASET, options, [])).trim().split('\r\n')).toHaveLength(1);
});
