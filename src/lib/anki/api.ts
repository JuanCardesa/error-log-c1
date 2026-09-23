import { z } from 'zod';
import { AnkiError, unwrap, type Transport } from './connect';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const int = z.number().int();
export const cardSchema = z.object({
  cardId: id, note: id, deckName: z.string(), modelName: z.string(),
  ord: int.nonnegative(), lapses: int.nonnegative(), reps: int.nonnegative(),
  queue: int, interval: int,
});
export const noteSchema = z.object({
  noteId: id, tags: z.array(z.string()), modelName: z.string(), cards: z.array(id),
  fields: z.record(z.string(), z.object({ value: z.string(), order: int.nonnegative() })),
});
export const reviewSchema = z.object({
  id, ease: int, ivl: int, lastIvl: int, factor: int, time: int.nonnegative(), type: int,
});
export type AnkiCard = z.infer<typeof cardSchema>;
export type AnkiNote = z.infer<typeof noteSchema>;
export type AnkiReview = z.infer<typeof reviewSchema>;

export function parseAnki<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AnkiError('ANKI_RESPUESTA_RARA', 'AnkiConnect devolvió datos inesperados. Actualiza el complemento y vuelve a intentarlo.');
  return result.data;
}

/** Los IDs de cardsInfo dependen de findCards; los de notesInfo dependen de cardsInfo. */
export function ankiApi(transport: Transport) {
  const call = async (action: string, params: Record<string, unknown> = {}) => {
    try { return unwrap(await transport({ action, version: 6, params })); }
    catch (error) {
      if (error instanceof AnkiError) throw error;
      throw new AnkiError('ANKI_CERRADO', 'No se puede conectar con AnkiConnect. Abre Anki y vuelve a intentarlo.');
    }
  };
  return {
    async version() { return parseAnki(int.min(6), await call('version')); },
    async profile() { return parseAnki(z.string().min(1), await call('getActiveProfile')); },
    async deckNames() { return parseAnki(z.array(z.string()), await call('deckNames')); },
    /** Sin esquema: la forma cambia entre versiones y `rolloverFrom` ya tolera lo que venga. */
    async preferences() { return await call('getPreferences'); },
    async findCards(query: string) { return parseAnki(z.array(id), await call('findCards', { query })); },
    async findNotes(query: string) { return parseAnki(z.array(id), await call('findNotes', { query })); },
    async notesInfo(notes: readonly number[]): Promise<(AnkiNote | null)[]> {
      const rows = parseAnki(z.array(z.unknown()), await call('notesInfo', { notes }));
      if (rows.length !== notes.length) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Faltan notas en la respuesta de Anki.');
      return rows.map((row, index) => {
        if (row !== null && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length === 0) return null;
        const note = parseAnki(noteSchema, row);
        if (note.noteId !== notes[index]) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Las notas recibidas no coinciden con las solicitadas.');
        return note;
      });
    },
    async cardSnapshot(cards: readonly number[]) {
      const rows = parseAnki(z.tuple([z.unknown(), z.unknown()]), await call('multi', { actions: [
        { action: 'cardsInfo', version: 6, params: { cards } },
        { action: 'getReviewsOfCards', version: 6, params: { cards } },
      ] }));
      const raw = parseAnki(z.array(z.unknown()), unwrap(rows[0]));
      // cardsInfo devuelve {} por cada carta que ya no existe. Pasarlo por el esquema
      // daria «actualiza el complemento», que manda a arreglar lo que no esta roto.
      if (raw.some((row) => row !== null && typeof row === 'object' && Object.keys(row).length === 0)) {
        throw new AnkiError('ANKI_RESPUESTA_RARA', 'Alguna carta dejó de existir durante la lectura. Vuelve a sincronizar.');
      }
      const info = parseAnki(z.array(cardSchema), raw);
      const reviews = parseAnki(z.record(z.string(), z.array(reviewSchema)), unwrap(rows[1]));
      if (info.length !== cards.length || info.some((card, i) => card.cardId !== cards[i])
        || Object.keys(reviews).length !== cards.length || cards.some((card) => reviews[String(card)] === undefined)) {
        throw new AnkiError('ANKI_RESPUESTA_RARA', 'La colección cambió durante la lectura. Vuelve a sincronizar.');
      }
      return { cards: info, reviews };
    },
    async modelNames() { return parseAnki(z.array(z.string()), await call('modelNames')); },
    async modelFields(modelName: string) { return parseAnki(z.array(z.string()), await call('modelFieldNames', { modelName })); },
    async createModel(params: Record<string, unknown>) { await call('createModel', params); },
    async createDeck(deck: string) { return parseAnki(id, await call('createDeck', { deck })); },
    async addNote(note: Record<string, unknown>) { return parseAnki(id, await call('addNote', { note })); },
    async updateNoteFields(note: Record<string, unknown>) { await call('updateNoteFields', { note }); },
  };
}

const escapeSearch = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\*/g, '\\*').replace(/_/g, '\\_');

export function searchTerm(kind: 'deck' | 'tag', value: string): string {
  return `${kind}:"${escapeSearch(value)}"`;
}

/**
 * Búsqueda por campo. Verificado contra una colección real: la forma `"Campo:valor"`
 * empareja, y los dos puntos del valor son literales dentro de las comillas.
 */
export function fieldTerm(field: string, value: string): string {
  return `"${field}:${escapeSearch(value)}"`;
}
