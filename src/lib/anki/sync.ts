import type { Db } from '../db/client';
import { assertAnkiScope, getAnkiSync, linkedAnkiNotes, saveAnkiSnapshot } from '../db/ankiRepo';
import { loadAnkiDataset } from '../db/load';
import { ankiApi, searchTerm, type AnkiNote, type AnkiCard, type AnkiReview } from './api';
import { ankiConfig, type AnkiConfig } from './config';
import { AnkiError, ankiMessage, httpTransport, withRetry, type Transport } from './connect';
import { reconcile } from './reconcile';
import { resolveRollover } from './schedule';

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
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('El tamaño de lote debe ser un entero positivo.');
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

export interface AnkiStatus {
  readonly available: boolean;
  readonly message: string;
}

/**
 * Se guarda el saludo por conexión y configuración. El perfil se consulta incluso
 * dentro del TTL: puede cambiar en Anki sin que cambie el entorno del servidor.
 */
const statusCache = new WeakMap<Db, { key: string; profile: string; at: number; status: AnkiStatus }>();

export function forgetAnkiStatus(db: Db): void {
  statusCache.delete(db);
}

/**
 * Sin reintentos: se ejecuta al pintar la pagina y aqui esperar solo retrasa el aviso.
 *
 * La configuracion y el transporte se resuelven **dentro** del try. Como argumentos por
 * defecto se evaluaban antes, y un ajuste invalido tumbaba la vista entera en vez de
 * aparecer como un estado mas.
 */
export async function ankiStatus(db: Db, config?: AnkiConfig, transport?: Transport, now = Date.now()): Promise<AnkiStatus> {
  try {
    const resolved = config ?? ankiConfig();
    const cached = statusCache.get(db);
    const state = getAnkiSync(db);
    const key = JSON.stringify([resolved.url, resolved.sourceDeck, resolved.targetDeck, resolved.apiKey,
      resolved.disabled, resolved.statusTtlMs, state?.namespace, state?.profile, state?.url, state?.sourceDeck, state?.targetDeck]);
    const api = ankiApi(transport ?? httpTransport(resolved));
    const fresh = cached !== undefined && cached.key === key && now >= cached.at && now - cached.at < resolved.statusTtlMs;
    if (!fresh) await api.version();
    const profile = await api.profile();
    assertAnkiScope(getAnkiSync(db), resolved, profile);
    if (fresh && cached.profile === profile) return cached.status;
    if (fresh) await api.version();
    const status = { available: true, message: `Anki conectado · perfil ${profile}` };
    statusCache.set(db, { key, profile, at: now, status });
    return status;
  } catch (error) {
    forgetAnkiStatus(db);
    return { available: false, message: ankiMessage(error) };
  }
}

export async function syncAnki(db: Db, transport?: Transport, now = new Date(), config: AnkiConfig = ankiConfig()) {
  const deadline = Date.now() + config.syncBudgetMs;
  const controller = new AbortController();
  const timeout = new AnkiError('ANKI_LENTO',
    `La sincronización ha agotado su plazo de ${String(config.syncBudgetMs / 1000)} s y se ha detenido sin guardar nada. `
    + 'Comprueba que Anki responde y vuelve a intentarlo; si tu colección es muy grande, sube ANKI_SYNC_BUDGET_MS.');
  const checkDeadline = (): void => {
    if (Date.now() >= deadline) controller.abort(timeout);
    controller.signal.throwIfAborted();
  };
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(timeout); reject(timeout); }, config.syncBudgetMs);
  });
  forgetAnkiStatus(db);
  const operation = withAnkiLock(db, async () => {
    checkDeadline();
    const send = transport ?? withRetry(httpTransport(config));
    const api = ankiApi(async (request) => {
      checkDeadline();
      try { return await send(request, controller.signal); }
      finally { checkDeadline(); }
    });
    await api.version();
    const profile = await api.profile();
    assertAnkiScope(getAnkiSync(db), config, profile);
    const decks = await api.deckNames();
    if (!decks.includes(config.sourceDeck)) throw new AnkiError('ANKI_CONFIG', `No se encuentra el mazo «${config.sourceDeck}» en el perfil abierto.`);
    const rollover = resolveRollover(config.rolloverHour);
    // Incluir nuevas: una carta restablecida puede seguir teniendo historial.
    const ids = [...new Set(await api.findCards(`(${searchTerm('deck', config.sourceDeck)} OR ${searchTerm('deck', config.targetDeck)})`))];
    const cards: AnkiCard[] = [];
    const reviews: Record<string, AnkiReview[]> = {};
    for (const batch of batches(ids, config.batchSize)) {
      const snapshot = await api.cardSnapshot(batch);
      cards.push(...snapshot.cards);
      Object.assign(reviews, snapshot.reviews);
    }
    // Los vínculos se verifican fuera del filtro de mazo: mover una nota no es borrarla.
    const noteIds = [...new Set([...cards.map((card) => card.note), ...linkedAnkiNotes(db)])];
    const notes: AnkiNote[] = [];
    const missingNoteIds: number[] = [];
    for (const batch of batches(noteIds, config.batchSize)) {
      const found = await api.notesInfo(batch);
      found.forEach((note, index) => {
        if (note === null) missingNoteIds.push(batch[index]!);
        else notes.push(note);
      });
    }
    if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió durante la lectura. No se ha guardado; vuelve a sincronizar.');
    const plan = reconcile({ cards, notes, reviews, missingNoteIds }, loadAnkiDataset(db), now, rollover);
    checkDeadline();
    saveAnkiSnapshot(db, plan, config, profile, now.toISOString(), checkDeadline);
    return { reviews: plan.reviews.length, newReviews: plan.newReviews, cards: cards.length, notes: notes.length, rollover };
  });
  try {
    return await Promise.race([expired, operation]);
  } finally {
    clearTimeout(timer!);
    forgetAnkiStatus(db);
  }
}
