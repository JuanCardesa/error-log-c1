import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Messages } from '../i18n';
import { importEnvelopeSchema, importIssues, importParseOptions } from '../import/errors';
import { validateImportRows } from '../import/validateRows';
import { sessionInputSchema } from '../validation/schemas';
import type { Db } from './client';
import { createSessionWithErrors } from './repo';

/** Entrada no confiable, incluso si el navegador ya preparó la vista previa. */
export function importSessionWithErrors(db: Db, value: unknown, options: {
  today: string; durationMin: unknown; importId?: string; t: Messages;
}) {
  const { t } = options;
  if (options.importId !== undefined && !z.uuid().safeParse(options.importId).success) return {
    ok: false, fieldErrors: {}, message: t.import.invalidImportId,
  };
  const envelope = importEnvelopeSchema(options.today, t).safeParse(value, importParseOptions(t));
  const duration = z.number().int().nonnegative().nullable().safeParse(options.durationMin);
  const fieldErrors: Record<string, string[]> = {};
  if (!envelope.success) for (const issue of envelope.error.issues) {
    (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
  }
  if (!duration.success) fieldErrors['session.durationMin'] = [t.import.invalidMinutes];
  if (!envelope.success || !duration.success) return {
    ok: false, fieldErrors,
    message: t.import.notCreated(
      !envelope.success && envelope.error.issues.some((issue) => issue.path[0] === 'errors') ? 'fields' : 'header',
      !envelope.success ? importIssues(envelope.error, value, t) : '',
    ),
  };
  const header = sessionInputSchema({ today: options.today, t }).safeParse({
    ...envelope.data.session, durationMin: duration.data, status: 'OPEN',
  }, importParseOptions(t));
  if (!header.success) {
    for (const issue of header.error.issues) (fieldErrors[`session.${issue.path.join('.')}`] ??= []).push(issue.message);
    return { ok: false, fieldErrors, message: t.import.headerNotCreated };
  }
  // Identificador provisional solo para validar; la transacción asigna la FK real.
  const validated = validateImportRows(envelope.data.errors, { ...options, sessionId: 1, timed: header.data.timed });
  if (Object.keys(validated.fieldErrors).length > 0) return {
    ok: false, fieldErrors: validated.fieldErrors,
    message: t.import.rowsNotCreated,
  };
  const receipt = options.importId === undefined ? undefined : {
    importId: options.importId,
    payloadHash: createHash('sha256').update(JSON.stringify([header.data, validated.inputs])).digest('hex'),
  };
  const result = createSessionWithErrors(db, header.data, validated.inputs, receipt);
  if (!result.ok) return { ok: false, fieldErrors: {}, message: result.reason === 'changed'
    ? t.import.savedWithOtherData
    : t.import.savedButDeleted };
  return { ok: true, fieldErrors, createdId: result.sessionId,
    message: t.import.sessionCreated(result.repeated, result.created, result.skipped) };
}
