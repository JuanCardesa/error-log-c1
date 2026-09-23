import type { z } from 'zod';

/**
 * Lectura de `FormData` y agrupacion de errores de Zod, compartidas por las acciones
 * de servidor para que Registrar y Writing no puedan divergir en lo mismo.
 */

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** `''` se trata como ausente, que es lo que manda un input numerico vacio. */
export function integer(form: FormData, key: string): number | null {
  const raw = text(form, key).trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function checkbox(form: FormData, key: string): boolean {
  return form.get(key) !== null;
}

/** Un identificador que llega del formulario solo vale si es un entero positivo. */
export function isValidId(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

export function collectIssues(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    const bucket = fieldErrors[key];
    if (bucket === undefined) fieldErrors[key] = [issue.message];
    else bucket.push(issue.message);
  }
  return fieldErrors;
}
