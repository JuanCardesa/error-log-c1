'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { unmarkAnkiAdded } from '@/lib/db/repo';
import { createAnkiNote, updateAnkiNote } from '@/lib/anki/create';
import { syncAnki } from '@/lib/anki/sync';
import { ankiMessage } from '@/lib/anki/connect';
import { getT } from '../_shared/i18nServer';

function refreshAnki() {
  revalidatePath('/anki');
  revalidatePath('/informe');
  revalidatePath('/exportar');
}

export async function syncAnkiAction() {
  const t = await getT();
  try {
    const result = await syncAnki(getDb());
    refreshAnki();
    return { ok: true, message: t.anki.synced(result.newReviews, result.reviews, result.cards, result.notes) };
  } catch (error) { return { ok: false, message: ankiMessage(error, t) }; }
}

export async function createAnkiAction(id: number) {
  const t = await getT();
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: t.anki.invalidId };
  try {
    await createAnkiNote(getDb(), id);
    refreshAnki();
    return { ok: true, message: t.anki.cardVerified };
  } catch (error) { return { ok: false, message: ankiMessage(error, t) }; }
}

/** Reescribe la tarjeta con el texto actual del error. Es la unica escritura ademas de crear. */
export async function updateAnkiAction(id: number) {
  const t = await getT();
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: t.anki.invalidId };
  try {
    await updateAnkiNote(getDb(), id);
    refreshAnki();
    return { ok: true, message: t.anki.cardUpdated };
  } catch (error) { return { ok: false, message: ankiMessage(error, t) }; }
}

/** Deshacer, por si se marca de mas. Limpia tambien la fecha: hay un CHECK que lo exige. */
export async function undoAddedAction(id: number) {
  const t = await getT();
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: t.anki.invalidId };
  unmarkAnkiAdded(getDb(), id);
  refreshAnki();
  return { ok: true, message: t.anki.returned };
}
