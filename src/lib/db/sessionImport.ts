import { z } from 'zod';
import { importEnvelopeSchema, importIssues } from '../import/errors';
import { validateImportRows } from '../import/validateRows';
import { sessionInputSchema } from '../validation/schemas';
import type { Db } from './client';
import { createSessionWithErrors } from './repo';

/** Entrada no confiable, incluso si el navegador ya preparó la vista previa. */
export function importSessionWithErrors(db: Db, value: unknown, options: {
  today: string; now: string; elapsed: number; durationMin: unknown;
}) {
  const envelope = importEnvelopeSchema(options.today).safeParse(value);
  const duration = z.number().int().nonnegative().nullable().safeParse(options.durationMin);
  const fieldErrors: Record<string, string[]> = {};
  if (!envelope.success) for (const issue of envelope.error.issues) {
    (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
  }
  if (!duration.success) fieldErrors['session.durationMin'] = ['Los minutos deben ser un entero no negativo o quedar vacíos.'];
  if (!envelope.success || !duration.success) return {
    ok: false, fieldErrors,
    message: `Revisa la cabecera. No se ha creado ninguna sesión. ${!envelope.success ? importIssues(envelope.error) : ''}`,
  };
  const header = sessionInputSchema({ today: options.today }).parse({
    ...envelope.data.session, durationMin: duration.data, status: 'OPEN',
  });
  // Identificador provisional solo para validar; la transacción asigna la FK real.
  const validated = validateImportRows(envelope.data.errors, { ...options, sessionId: 1, timed: header.timed });
  if (Object.keys(validated.fieldErrors).length > 0) return {
    ok: false, fieldErrors: validated.fieldErrors,
    message: 'Revisa los campos señalados. No se ha creado ninguna sesión ni guardado ningún error.',
  };
  const result = createSessionWithErrors(db, header, validated.inputs);
  return { ok: true, fieldErrors: {}, createdId: result.sessionId,
    message: `Sesión creada con ${String(result.created)} errores.${result.skipped > 0 ? ` ${String(result.skipped)} repetidos omitidos.` : ''}` };
}
