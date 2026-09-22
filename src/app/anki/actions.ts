'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { getError, markAnkiAdded, unmarkAnkiAdded } from '@/lib/db/repo';
import { generatesCard } from '@/lib/domain/enums';
import { createAnkiNote, updateAnkiNote } from '@/lib/anki/create';
import { syncAnki } from '@/lib/anki/sync';
import { ankiMessage } from '@/lib/anki/connect';

function refreshAnki() {
  revalidatePath('/anki');
  revalidatePath('/informe');
  revalidatePath('/exportar');
}

export async function syncAnkiAction() {
  try {
    const result = await syncAnki(getDb());
    refreshAnki();
    return { ok: true, message: `Sincronizado: ${String(result.newReviews)} repasos nuevos; ${String(result.reviews)} en el historial.` };
  } catch (error) { return { ok: false, message: ankiMessage(error) }; }
}

export async function createAnkiAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: 'Identificador de error inválido.' };
  try {
    await createAnkiNote(getDb(), id);
    refreshAnki();
    return { ok: true, message: 'Tarjeta verificada en Anki.' };
  } catch (error) { return { ok: false, message: ankiMessage(error) }; }
}

/** Reescribe la tarjeta con el texto actual del error. Es la unica escritura ademas de crear. */
export async function updateAnkiAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: 'Identificador de error inválido.' };
  try {
    await updateAnkiNote(getDb(), id);
    refreshAnki();
    return { ok: true, message: 'Tarjeta actualizada en Anki.' };
  } catch (error) { return { ok: false, message: ankiMessage(error) }; }
}

/** Sella la conversion. La fecha la pone el servidor: es un hecho, no un dato de entrada. */
export async function markAddedAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: 'Identificador de error inválido.' };
  const error = getError(getDb(), id);
  if (error === null || !generatesCard(error.cause)) {
    return { ok: false, message: 'Ese error no existe o su causa no genera tarjeta.' };
  }
  markAnkiAdded(getDb(), id, new Date().toISOString());
  refreshAnki();
  return { ok: true, message: 'Marcada a mano. No se ha comprobado que la tarjeta exista en Anki.' };
}

/** Deshacer, por si se marca de mas. Limpia tambien la fecha: hay un CHECK que lo exige. */
export async function undoAddedAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: 'Identificador de error inválido.' };
  unmarkAnkiAdded(getDb(), id);
  refreshAnki();
  return { ok: true, message: 'Devuelto a la cola. La nota sigue en Anki.' };
}
