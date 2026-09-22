import { randomUUID } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import type { Db } from './client';
import { ankiCard, ankiNote, ankiReview, ankiSync, errorRow } from './schema';
import type { AnkiConfig } from '../anki/config';
import { AnkiError } from '../anki/connect';
import type { AnkiNoteRow, AnkiSyncRow } from '../domain/types';
import type { reconcile } from '../anki/reconcile';

type AnkiDb = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'transaction'>;

export function getAnkiSync(db: AnkiDb): AnkiSyncRow | null {
  return db.select().from(ankiSync).get() ?? null;
}

export function assertAnkiScope(state: AnkiSyncRow | null, config: AnkiConfig, profile: string): void {
  if (state !== null && (state.profile !== profile || state.url !== config.url
    || state.sourceDeck !== config.sourceDeck || state.targetDeck !== config.targetDeck)) {
    throw new AnkiError('ANKI_CONFIG', `Esta base está vinculada al perfil ${state.profile} y al mazo ${state.sourceDeck}. Abre ese perfil y conserva su configuración para no mezclar colecciones.`);
  }
}

/** Persiste la identidad antes de escribir en Anki, para poder recuperar un timeout. */
export function ensureAnkiScope(db: AnkiDb, config: AnkiConfig, profile: string): AnkiSyncRow {
  return db.transaction((tx) => {
    const existing = getAnkiSync(tx);
    assertAnkiScope(existing, config, profile);
    if (existing !== null) return existing;
    return tx.insert(ankiSync).values({
      id: 1, namespace: randomUUID(), profile, url: config.url,
      sourceDeck: config.sourceDeck, targetDeck: config.targetDeck,
    }).returning().get();
  });
}

export function linkedAnkiNotes(db: AnkiDb): number[] {
  return db.select({ noteId: errorRow.ankiNoteId }).from(errorRow)
    .where(isNotNull(errorRow.ankiNoteId)).all().flatMap((row) => row.noteId === null ? [] : [row.noteId]);
}

/**
 * Minimo de vinculos para desconfiar de una desaparicion total. Con uno o dos, borrar
 * ambas tarjetas a mano es corriente; a partir de tres, que no quede ninguna es la firma
 * de otra coleccion bajo el mismo perfil, no la de una limpieza.
 */
const MIN_LINKED_TO_GUARD = 3;

/**
 * Desvincular borra `anki_added_at`, que es la unica marca de cuando se convirtio un
 * error: no se reconstruye sincronizando otra vez. Restaurar una copia antigua de la
 * coleccion mantiene el perfil y el mazo, pero renumera cada nota, asi que la lectura
 * es legitima y vacia el historial entero de una vez. Se exige que quede al menos un
 * vinculo reconocido para creer que la coleccion es la misma.
 */
function assertNotWholesaleUnlink(db: AnkiDb, missingNoteIds: readonly number[]): void {
  const linked = new Set(linkedAnkiNotes(db));
  if (linked.size < MIN_LINKED_TO_GUARD) return;
  if (missingNoteIds.filter((noteId) => linked.has(noteId)).length !== linked.size) return;
  throw new AnkiError('ANKI_CONFIG',
    `Anki no reconoce ninguna de las ${String(linked.size)} notas vinculadas a esta base. `
    + 'Suele significar que el perfil abierto tiene otra coleccion, restaurada o recreada. '
    + 'No se ha cambiado nada. Si de verdad has borrado todas esas tarjetas, usa «Deshacer» '
    + 'en la cola de conversion y vuelve a sincronizar.');
}

export function linkAnkiNote(db: Db, errorId: number, note: AnkiNoteRow, at: string): void {
  db.transaction((tx) => {
    tx.insert(ankiNote).values(note).onConflictDoUpdate({ target: ankiNote.noteId, set: note }).run();
    tx.update(errorRow).set({ ankiNoteId: note.noteId, ankiAdded: true, ankiAddedAt: at })
      .where(eq(errorRow.id, errorId)).run();
  });
}

/** Solo toca el espejo local. Nunca borra ni modifica notas de Anki. */
export function saveAnkiSnapshot(db: Db, plan: ReturnType<typeof reconcile>, config: AnkiConfig, profile: string, at: string): void {
  db.transaction((tx) => {
    ensureAnkiScope(tx, config, profile);
    // Dentro de la transaccion: el recuento de vinculos que se comprueba es el que se escribe.
    assertNotWholesaleUnlink(tx, plan.missingNoteIds);
    for (const noteId of plan.missingNoteIds) {
      tx.update(errorRow).set({ ankiNoteId: null, ankiAdded: false, ankiAddedAt: null })
        .where(eq(errorRow.ankiNoteId, noteId)).run();
    }
    for (const note of plan.notes) {
      tx.insert(ankiNote).values(note).onConflictDoUpdate({ target: ankiNote.noteId, set: note }).run();
    }
    // Reconciliar el snapshot completo también retira reviews deshechas e IDs antiguos
    // que llegaron de una importación. La sustitución es atómica y solo del caché.
    tx.delete(ankiReview).run();
    tx.delete(ankiCard).run();
    for (const card of plan.cards) tx.insert(ankiCard).values(card).run();
    for (const review of plan.reviews) tx.insert(ankiReview).values(review).run();
    for (const noteId of plan.missingNoteIds) tx.delete(ankiNote).where(eq(ankiNote.noteId, noteId)).run();
    tx.update(ankiSync).set({ lastSyncedAt: at, notesSeen: plan.notes.length }).where(eq(ankiSync.id, 1)).run();
  });
}
