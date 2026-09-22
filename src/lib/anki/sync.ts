import type { Db } from '../db/client';
import { assertAnkiScope, getAnkiSync, linkedAnkiNotes, saveAnkiSnapshot } from '../db/ankiRepo';
import { loadAnkiDataset } from '../db/load';
import { ankiApi, searchTerm, type AnkiNote, type AnkiCard, type AnkiReview } from './api';
import { ankiConfig, type AnkiConfig } from './config';
import { AnkiError, ankiMessage, httpTransport, withRetry, type Transport } from './connect';
import { reconcile } from './reconcile';
import { DEFAULT_ROLLOVER_HOUR, rolloverFrom } from './schedule';

/**
 * El corte de dia sale de la propia coleccion. `getPreferences` no esta en todas las
 * versiones de AnkiConnect: que falte no puede impedir sincronizar, asi que se cae al
 * valor por defecto de Anki. Un fallo de conexion si se propaga; no es lo mismo.
 */
async function readRollover(api: ReturnType<typeof ankiApi>): Promise<number> {
  try {
    return rolloverFrom(await api.preferences());
  } catch (error) {
    if (error instanceof AnkiError && error.code === 'ANKI_ERROR') return DEFAULT_ROLLOVER_HOUR;
    throw error;
  }
}

const locks = new WeakMap<Db, Promise<unknown>>();
/** Una operación por conexión local: evita intercalar snapshots y dobles clics. */
export async function withAnkiLock<T>(db: Db, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(db) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  locks.set(db, current);
  try { return await current; }
  finally { if (locks.get(db) === current) locks.delete(db); }
}

export function batches<T>(values: readonly T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

/** Sin reintentos: se ejecuta al pintar la pagina y aqui esperar solo retrasa el aviso. */
export async function ankiStatus(db: Db, config = ankiConfig(), transport = httpTransport(config)) {
  try {
    const api = ankiApi(transport);
    await api.version();
    const profile = await api.profile();
    assertAnkiScope(getAnkiSync(db), config, profile);
    return { available: true, message: `Anki conectado · perfil ${profile}` };
  } catch (error) { return { available: false, message: ankiMessage(error) }; }
}

export async function syncAnki(db: Db, transport?: Transport, now = new Date(), config: AnkiConfig = ankiConfig()) {
  return withAnkiLock(db, async () => {
    const api = ankiApi(transport ?? withRetry(httpTransport(config)));
    await api.version();
    const profile = await api.profile();
    assertAnkiScope(getAnkiSync(db), config, profile);
    const decks = await api.deckNames();
    if (!decks.includes(config.sourceDeck)) throw new AnkiError('ANKI_CONFIG', `No se encuentra el mazo «${config.sourceDeck}» en el perfil abierto.`);
    const rolloverHour = await readRollover(api);
    // Incluir nuevas: una carta restablecida puede seguir teniendo historial.
    const ids = [...new Set(await api.findCards(`(${searchTerm('deck', config.sourceDeck)} OR ${searchTerm('deck', config.targetDeck)})`))];
    const cards: AnkiCard[] = [];
    const reviews: Record<string, AnkiReview[]> = {};
    for (const batch of batches(ids)) {
      const snapshot = await api.cardSnapshot(batch);
      cards.push(...snapshot.cards);
      Object.assign(reviews, snapshot.reviews);
    }
    // Los vínculos se verifican fuera del filtro de mazo: mover una nota no es borrarla.
    const noteIds = [...new Set([...cards.map((card) => card.note), ...linkedAnkiNotes(db)])];
    const notes: AnkiNote[] = [];
    const missingNoteIds: number[] = [];
    for (const batch of batches(noteIds)) {
      const found = await api.notesInfo(batch);
      found.forEach((note, index) => {
        if (note === null) missingNoteIds.push(batch[index]!);
        else notes.push(note);
      });
    }
    if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió durante la lectura. No se ha guardado; vuelve a sincronizar.');
    const plan = reconcile({ cards, notes, reviews, missingNoteIds }, loadAnkiDataset(db), now, rolloverHour);
    saveAnkiSnapshot(db, plan, config, profile, now.toISOString());
    return { reviews: plan.reviews.length, newReviews: plan.newReviews, cards: cards.length, notes: notes.length, rolloverHour };
  });
}
