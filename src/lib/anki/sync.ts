import type { Db } from '../db/client';
import { assertAnkiScope, getAnkiSync, linkedAnkiNotes, saveAnkiSnapshot } from '../db/ankiRepo';
import { loadAnkiDataset } from '../db/load';
import { ankiApi, searchTerm, type AnkiNote, type AnkiCard, type AnkiReview } from './api';
import { ankiConfig, type AnkiConfig } from './config';
import { AnkiError, ankiMessage, httpTransport, withRetry, type Transport } from './connect';
import { reconcile } from './reconcile';
import { resolveRollover, type Rollover } from './schedule';

/**
 * Se intenta leer el corte de la coleccion, aunque hoy ninguna version conocida de
 * AnkiConnect lo expone: responde «unsupported action», que llega aqui como ANKI_ERROR.
 * Que falte no puede impedir sincronizar. Un fallo de conexion si se propaga: no es lo
 * mismo que la accion no exista a que Anki se haya cerrado a mitad.
 */
async function readRollover(api: ReturnType<typeof ankiApi>, config: AnkiConfig): Promise<Rollover> {
  try {
    return resolveRollover(await api.preferences(), config.rolloverHour);
  } catch (error) {
    if (error instanceof AnkiError && error.code === 'ANKI_ERROR') return resolveRollover(null, config.rolloverHour);
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

export function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

export interface AnkiStatus {
  readonly available: boolean;
  readonly message: string;
}

/**
 * El estado se guarda un rato por conexion; cuanto, lo dice la configuracion.
 *
 * `/anki` es `force-dynamic`, asi que cada visita preguntaba dos veces a Anki: 67 ms
 * medidos por render. A cambio, cerrar Anki tarda esa ventana en notarse, asi que las
 * acciones que hablan con Anki la invalidan y en las pruebas vale cero.
 */
const statusCache = new WeakMap<Db, { at: number; status: AnkiStatus }>();

export function forgetAnkiStatus(db: Db): void {
  statusCache.delete(db);
}

/** Sin reintentos: se ejecuta al pintar la pagina y aqui esperar solo retrasa el aviso. */
export async function ankiStatus(db: Db, config = ankiConfig(), transport = httpTransport(config), now = Date.now()): Promise<AnkiStatus> {
  const cached = statusCache.get(db);
  if (cached !== undefined && now - cached.at < config.statusTtlMs) return cached.status;
  const status = await (async (): Promise<AnkiStatus> => {
    try {
      const api = ankiApi(transport);
      await api.version();
      const profile = await api.profile();
      assertAnkiScope(getAnkiSync(db), config, profile);
      return { available: true, message: `Anki conectado · perfil ${profile}` };
    } catch (error) { return { available: false, message: ankiMessage(error) }; }
  })();
  statusCache.set(db, { at: now, status });
  return status;
}

export async function syncAnki(db: Db, transport?: Transport, now = new Date(), config: AnkiConfig = ankiConfig()) {
  forgetAnkiStatus(db);
  return withAnkiLock(db, async () => {
    const api = ankiApi(transport ?? withRetry(httpTransport(config)));
    await api.version();
    const profile = await api.profile();
    assertAnkiScope(getAnkiSync(db), config, profile);
    const decks = await api.deckNames();
    if (!decks.includes(config.sourceDeck)) throw new AnkiError('ANKI_CONFIG', `No se encuentra el mazo «${config.sourceDeck}» en el perfil abierto.`);
    const rollover = await readRollover(api, config);
    // Incluir nuevas: una carta restablecida puede seguir teniendo historial.
    const ids = [...new Set(await api.findCards(`(${searchTerm('deck', config.sourceDeck)} OR ${searchTerm('deck', config.targetDeck)})`))];
    /**
     * Tope para la lectura entera, no solo por peticion. El plazo por lote acota cada
     * llamada, pero una coleccion que responde despacio en todas podia dejar la pantalla
     * girando sin final a la vista. Se comprueba entre lotes: no interrumpe una peticion
     * en vuelo, pero el peor caso deja de ser indefinido.
     */
    const deadline = Date.now() + config.syncBudgetMs;
    const outOfTime = (): boolean => Date.now() > deadline;
    const giveUp = (): never => {
      throw new AnkiError('ANKI_LENTO',
        `La sincronización lleva más de ${String(Math.round(config.syncBudgetMs / 1000))} s y se ha detenido sin guardar nada. `
        + 'Comprueba que Anki responde y vuelve a intentarlo; si tu colección es muy grande, sube ANKI_SYNC_BUDGET_MS.');
    };

    const cards: AnkiCard[] = [];
    const reviews: Record<string, AnkiReview[]> = {};
    for (const batch of batches(ids, config.batchSize)) {
      if (outOfTime()) giveUp();
      const snapshot = await api.cardSnapshot(batch);
      cards.push(...snapshot.cards);
      Object.assign(reviews, snapshot.reviews);
    }
    // Los vínculos se verifican fuera del filtro de mazo: mover una nota no es borrarla.
    const noteIds = [...new Set([...cards.map((card) => card.note), ...linkedAnkiNotes(db)])];
    const notes: AnkiNote[] = [];
    const missingNoteIds: number[] = [];
    for (const batch of batches(noteIds, config.batchSize)) {
      if (outOfTime()) giveUp();
      const found = await api.notesInfo(batch);
      found.forEach((note, index) => {
        if (note === null) missingNoteIds.push(batch[index]!);
        else notes.push(note);
      });
    }
    if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió durante la lectura. No se ha guardado; vuelve a sincronizar.');
    const plan = reconcile({ cards, notes, reviews, missingNoteIds }, loadAnkiDataset(db), now, rollover);
    saveAnkiSnapshot(db, plan, config, profile, now.toISOString());
    return { reviews: plan.reviews.length, newReviews: plan.newReviews, cards: cards.length, notes: notes.length, rollover };
  });
}
