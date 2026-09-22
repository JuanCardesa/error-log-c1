import { ankiConfig } from '../config';
import type { AnkiCard, AnkiNote, AnkiReview } from '../api';
import { unwrap, type AnkiRequest, type Transport } from '../connect';
import { ERRORLOG_FIELDS } from '../create';
import type { AnkiDataset } from '../../domain/types';
import { reconcile } from '../reconcile';

export const CONFIG = ankiConfig({});
export const NOW = new Date('2026-09-22T12:00:00Z');
export const REVIEW = NOW.getTime() - 3600000;
export function review(overrides: Partial<AnkiReview> = {}): AnkiReview {
  return { id: REVIEW, ease: 1, ivl: -60, lastIvl: 2, factor: 2500, time: 1000, type: 1, ...overrides };
}
export function card(overrides: Partial<AnkiCard> = {}): AnkiCard {
  return { cardId: 10, note: 20, modelName: 'Practice', deckName: `${CONFIG.sourceDeck}::Vocabulary`, ord: 0, lapses: 1, reps: 2, queue: 2, interval: 5, ...overrides };
}
export function note(overrides: Partial<AnkiNote> = {}): AnkiNote {
  return { noteId: 20, modelName: 'Practice', tags: ['cat::phrasal_verb', 'cat::workplace_english'], cards: [10], fields: { Front: { value: 'deal with', order: 0 } }, ...overrides };
}

export function ankiFixture(): AnkiDataset {
  const snapshot = reconcile({ cards: [card()], notes: [note()], reviews: { '10': [review()] }, missingNoteIds: [] }, { cards: [], notes: [], reviews: [], sync: null }, NOW);
  return { ...snapshot, sync: null };
}

/**
 * `tag:"..."` de Anki: casa el tag exacto y sus hijos bajo `::`, sin distinguir
 * mayusculas, sobre el valor ya desescapado. Comparar por subcadena daria por buena
 * cualquier identidad contra el tag base `errorlog`.
 */
function matchesTag(query: string, tags: readonly string[]): boolean {
  const quoted = /^tag:"((?:[^"\\]|\\.)*)"$/.exec(query.trim());
  if (quoted === null) throw new Error(`Consulta de tag no simulada: ${query}`);
  const wanted = quoted[1]!.replace(/\\(.)/g, '$1').toLowerCase();
  return tags.some((tag) => tag.toLowerCase() === wanted || tag.toLowerCase().startsWith(`${wanted}::`));
}

/** Simula el contrato HTTP, incluyendo sobres y los resultados de multi. */
export class FakeAnki {
  calls: AnkiRequest[] = [];
  cards = [card()];
  notes = new Map<number, AnkiNote>([[20, note()]]);
  reviews: Record<string, AnkiReview[]> = { '10': [review()] };
  profile = 'Juan';
  decks = [CONFIG.sourceDeck];
  models: string[] = [];
  fields = ERRORLOG_FIELDS;
  disconnected = false;
  failAction: string | null = null;
  added = 0;
  afterAddFails = false;
  override: ((request: AnkiRequest) => unknown | undefined) | null = null;

  transport: Transport = async (request) => {
    this.calls.push(request);
    if (this.disconnected) throw new Error('ECONNREFUSED');
    if (this.failAction === request.action) return { result: null, error: 'Fallo simulado' };
    const custom = this.override?.(request);
    if (custom !== undefined) return custom;
    const result = await this.handle(request);
    return { result, error: null };
  };

  async handle({ action, params }: AnkiRequest): Promise<unknown> {
    switch (action) {
      case 'version': return 6;
      case 'getActiveProfile': return this.profile;
      case 'deckNames': return this.decks;
      case 'findCards': return this.cards.map((value) => value.cardId);
      case 'findNotes': {
        const query = String(params['query']);
        return [...this.notes.values()].filter((value) => matchesTag(query, value.tags)).map((value) => value.noteId);
      }
      case 'cardsInfo': return (params['cards'] as number[]).map((id) => this.cards.find((value) => value.cardId === id) ?? {});
      case 'getReviewsOfCards': return Object.fromEntries((params['cards'] as number[]).map((id) => [String(id), this.reviews[String(id)] ?? []]));
      case 'notesInfo': return (params['notes'] as number[]).map((id) => this.notes.get(id) ?? {});
      case 'multi': return Promise.all((params['actions'] as AnkiRequest[]).map((request) => this.transport(request)));
      case 'modelNames': return this.models;
      case 'modelFieldNames': return this.fields;
      case 'createModel': this.models.push(String(params['modelName'])); return {};
      case 'createDeck': return 30;
      case 'addNote': {
        const input = params['note'] as { fields: Record<string, string>; tags: string[]; modelName: string };
        const nid = 100 + this.added++;
        this.notes.set(nid, {
          noteId: nid, cards: [nid + 100], modelName: input.modelName, tags: input.tags,
          fields: Object.fromEntries(Object.entries(input.fields).map(([name, value], order) => [name, { value, order }])),
        });
        if (this.afterAddFails) { this.afterAddFails = false; throw new Error('Respuesta perdida'); }
        return nid;
      }
      default: throw new Error(`Acción no simulada: ${action}`);
    }
  }

  async result(action: string, params = {}) { return unwrap(await this.transport({ action, version: 6, params })); }
}
