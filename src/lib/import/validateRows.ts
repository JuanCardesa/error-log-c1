import { errorInputSchema, type ErrorInput } from '../validation/schemas';
import type { ImportDraft } from './errors';

/**
 * Una tanda pegada entra siempre pendiente de convertir.
 *
 * Antes se honraba un `ankiAdded` de la fila pegada y se le ponia sello con la hora de
 * entonces. La vista previa no dibuja esa casilla, asi que solo se llegaba por un POST
 * directo, y lo que quedaba era justo lo que esta rama quita del resto de caminos: una
 * conversion marcada sin tarjeta detras. El sello lo pone crear la nota en Anki y
 * verificarla; por eso aqui ya no hace falta reloj.
 */
export function validateImportRows(drafts: readonly ImportDraft[], options: {
  sessionId: number; timed: boolean;
}) {
  const fieldErrors: Record<string, string[]> = {};
  const inputs: ErrorInput[] = [];
  const { sessionId, timed } = options;
  drafts.forEach((draft, index) => {
    const parsed = errorInputSchema().safeParse({
      ...draft, sessionId, lateInSession: timed && draft.lateInSession,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = `${String(index)}.${issue.path.join('.')}`;
        (fieldErrors[key] ??= []).push(issue.message);
      }
    } else inputs.push(parsed.data);
  });
  return { fieldErrors, inputs };
}
