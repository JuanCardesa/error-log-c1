import { generatesCard } from '../domain/enums';
import { errorInputSchema, type ErrorInput } from '../validation/schemas';
import type { ImportDraft } from './errors';

export function validateImportRows(drafts: readonly ImportDraft[], options: {
  sessionId: number; timed: boolean; now: string;
}) {
  const fieldErrors: Record<string, string[]> = {};
  const inputs: ErrorInput[] = [];
  const { sessionId, timed, now } = options;
  drafts.forEach((draft, index) => {
    const parsed = errorInputSchema().safeParse({
      ...draft, sessionId, lateInSession: timed && draft.lateInSession,
      ankiAddedAt: draft.ankiAdded ? now : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = `${String(index)}.${issue.path.join('.')}`;
        (fieldErrors[key] ??= []).push(issue.message);
      }
    } else if (parsed.data.ankiAdded && !generatesCard(parsed.data.cause)) {
      fieldErrors[`${String(index)}.ankiAdded`] = ['Esta causa no se arregla con una tarjeta.'];
    } else inputs.push(parsed.data);
  });
  return { fieldErrors, inputs };
}
