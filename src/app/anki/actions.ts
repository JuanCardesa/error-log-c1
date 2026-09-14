'use server';

import { revalidatePath } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { markAnkiAdded, unmarkAnkiAdded } from '@/lib/db/repo';

/** Sella la conversion. La fecha la pone el servidor: es un hecho, no un dato de entrada. */
export async function markAddedAction(id: number): Promise<void> {
  markAnkiAdded(getDb(), id, new Date().toISOString());
  revalidatePath('/anki');
  revalidatePath('/informe');
}

/** Deshacer, por si se marca de mas. Limpia tambien la fecha: hay un CHECK que lo exige. */
export async function undoAddedAction(id: number): Promise<void> {
  unmarkAnkiAdded(getDb(), id);
  revalidatePath('/anki');
  revalidatePath('/informe');
}
