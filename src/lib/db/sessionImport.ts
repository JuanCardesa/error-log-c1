import { z } from 'zod';
import { importEnvelopeSchema, importIssues, importParseOptions } from '../import/errors';
import { validateImportRows } from '../import/validateRows';
import { sessionInputSchema } from '../validation/schemas';
import type { Db } from './client';
import { createSessionWithErrors } from './repo';

/** Entrada no confiable, incluso si el navegador ya preparó la vista previa. */
export function importSessionWithErrors(db: Db, value: unknown, options: {
  today: string; now: string; elapsed: number; durationMin: unknown;
}) {
  const envelope = importEnvelopeSchema(options.today).safeParse(value, importParseOptions);
  const duration = z.number().int().nonnegative().nullable().safeParse(options.durationMin);
  const fieldErrors: Record<string, string[]> = {};
  if (!envelope.success) for (const issue of envelope.error.issues) {
    (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
  }
  if (!duration.success) fieldErrors['session.durationMin'] = ['Los minutos deben ser un entero no negativo o quedar vacíos.'];
  if (!envelope.success || !duration.success) return {
    ok: false, fieldErrors,
    message: `Revisa ${!envelope.success && envelope.error.issues.some((issue) => issue.path[0] === 'errors') ? 'los campos señalados' : 'la cabecera'}. No se ha creado ninguna sesión. ${!envelope.success ? importIssues(envelope.error) : ''}`,
  };
  const header = sessionInputSchema({ today: options.today }).safeParse({
    ...envelope.data.session, durationMin: duration.data, status: 'OPEN',
  }, importParseOptions);
  if (!header.success) {
    for (const issue of header.error.issues) (fieldErrors[`session.${issue.path.join('.')}`] ??= []).push(issue.message);
    return { ok: false, fieldErrors, message: 'Revisa la cabecera. No se ha creado ninguna sesión.' };
  }
  // Identificador provisional solo para validar; la transacción asigna la FK real.
  const validated = validateImportRows(envelope.data.errors, { ...options, sessionId: 1, timed: header.data.timed });
  if (Object.keys(validated.fieldErrors).length > 0) return {
    ok: false, fieldErrors: validated.fieldErrors,
    message: 'Revisa los campos señalados. No se ha creado ninguna sesión ni guardado ningún error.',
  };
  const result = createSessionWithErrors(db, header.data, validated.inputs);
  return { ok: true, fieldErrors, createdId: result.sessionId,
    message: `Sesión creada con ${String(result.created)} ${result.created === 1 ? 'error' : 'errores'}.${result.skipped > 0 ? ` ${result.skipped === 1 ? '1 repetido omitido' : `${String(result.skipped)} repetidos omitidos`}.` : ''}` };
}
