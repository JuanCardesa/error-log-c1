import { z } from 'zod';

import { CATEGORIES, CAUSES, CONFIDENCES, PAPERS, SESSION_KINDS, SOURCES } from '../domain/enums';
import type { Messages } from '../i18n';
import { zodErrors } from '../i18n/zod';
import { sessionInputSchema } from '../validation/schemas';
import { toIsoDate } from '../time/dates';

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_LENGTH = 200_000;
export const MAX_SESSION_IMPORT_ROWS = 300;

/** Opciones de análisis de una tanda: mensajes de Zod en el idioma de quien la revisa. */
export function importParseOptions(t: Messages) {
  const base = zodErrors(t);
  return { error: ((issue) => issue.code === 'unrecognized_keys'
    ? t.import.unknownFields(issue.keys.join(', ')) : base(issue)) satisfies z.core.$ZodErrorMap };
}

// Lista cerrada de campos de la cabecera pegada. Ni id, status ni duración.
export const importedSessionSchema = z.strictObject({
  date: z.string(), kind: z.enum(SESSION_KINDS), paper: z.enum(PAPERS).nullable(),
  part: z.number().int().positive().nullable(), source: z.enum(SOURCES),
  sourceRef: z.string().nullable(), itemsTotal: z.number().int().nonnegative().nullable(),
  itemsCorrect: z.number().int().nonnegative().nullable(), timed: z.boolean(),
});
export type ImportedSession = z.infer<typeof importedSessionSchema>;

/**
 * Ítems y aciertos que llegan a null: quien solo ve los ítems fallados no los conoce. La
 * revisión los pide antes de guardar y el servidor vuelve a exigirlos al crear la sesión.
 */
function pendingCount(value: ImportedSession, path: readonly PropertyKey[]): boolean {
  const [field] = path;
  return (field === 'itemsTotal' || field === 'itemsCorrect') && value[field] === null;
}

export function importEnvelopeSchema(today: string, t: Messages) {
  return z.strictObject({
    session: importedSessionSchema.superRefine((value, ctx) => {
      const parsed = sessionInputSchema({ today, t }).safeParse(value, importParseOptions(t));
      if (!parsed.success) for (const issue of parsed.error.issues) {
        if (pendingCount(value, issue.path)) continue;
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    }),
    errors: sessionImportRowsSchema(t),
  });
}

export function importIssues(error: z.ZodError, t: Messages): string {
  return error.issues.map((issue) => `${issue.path.join('.') || t.import.envelope}: ${
    issue.code === 'unrecognized_keys' ? t.import.unknownFields(issue.keys.join(', ')) : issue.message
  }`).join('; ');
}

/** Lo que proponemos cuando la tanda no trae causa ni confianza; se revisan en la vista previa. */
const DEFAULT_CAUSE = 'DESCONOCIMIENTO';
const DEFAULT_CONFIDENCE = 'DUDABA';

// El borrador admite campos vacios para poder completarlos en la vista previa.
// La validacion de negocio se aplica al guardar, con errorInputSchema.
export const importDraftSchema = z.object({
  itemRef: z.union([z.string(), z.number()]).nullish().transform((v) => String(v ?? '')),
  prompt: z.string().default(''),
  myAnswer: z.string().nullish().transform((v) => v ?? ''),
  correctAnswer: z.string().default(''),
  ruleNote: z.string().default(''),
  cause: z.string().default(DEFAULT_CAUSE),
  category: z.string().default(''),
  subcategory: z.string().nullish().transform((v) => v ?? ''),
  confidence: z.string().default(DEFAULT_CONFIDENCE),
  lateInSession: z.boolean().default(false),
  // Sin `ankiAdded`: una conversion no se pega, se sella al crear la tarjeta. Si el
  // bloque lo trae, se descarta como cualquier otra clave que no este aqui.
});

export type ImportDraft = z.infer<typeof importDraftSchema>;

export const importBatchSchema = z.array(importDraftSchema).min(1).max(MAX_IMPORT_ROWS);
export function sessionImportRowsSchema(t: Messages) {
  return z.array(importDraftSchema).max(MAX_SESSION_IMPORT_ROWS, {
    error: t.import.tooManyRows(MAX_SESSION_IMPORT_ROWS),
  });
}

/** Ambos validadores identifican la posición enviada, con o sin el prefijo del sobre. */
export function errorsForRow(fieldErrors: Record<string, string[]>, position: number): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const prefix = [`${String(position)}.`, `errors.${String(position)}.`].find((value) => key.startsWith(value));
    if (prefix !== undefined) (result[key.slice(prefix.length)] ??= []).push(...messages);
  }
  return result;
}

const columns = [
  'itemRef', 'prompt', 'myAnswer', 'correctAnswer', 'category', 'ruleNote',
  'cause', 'confidence', 'subcategory',
] as const;

// Se aceptan las cabeceras de la plantilla en los dos idiomas, sin acentos ni espacios.
const headers: Readonly<Record<string, string>> = {
  item: 'itemRef', itemref: 'itemRef', enunciado: 'prompt', prompt: 'prompt',
  mirespuesta: 'myAnswer', myanswer: 'myAnswer', correcta: 'correctAnswer',
  respuestacorrecta: 'correctAnswer', correctanswer: 'correctAnswer',
  categoria: 'category', category: 'category', regla: 'ruleNote', rulenote: 'ruleNote',
  causa: 'cause', cause: 'cause', confianza: 'confidence', confidence: 'confidence',
  subcategoria: 'subcategory', subcategory: 'subcategory',
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/** Lee tabulaciones de una hoja de calculo, incluidas celdas con saltos de linea. */
function readTable(text: string, t: Messages): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (quoted || cell === '') quoted = !quoted;
      else cell += char;
    } else if (!quoted && (char === '\t' || char === '\n')) {
      row.push(cell);
      cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error(t.import.unclosedQuote);
  row.push(cell);
  rows.push(row);
  return rows.filter((values) => values.some((value) => value.trim() !== ''));
}

export interface ImportedBatch { session: ImportedSession | null; errors: ImportDraft[] }

export function parseImportedBatch(source: string, t: Messages, today = toIsoDate(new Date())): ImportedBatch {
  if (source.length > MAX_IMPORT_LENGTH) throw new Error(t.import.tooLong);
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')
    .replace(/^\s*```(?:json|tsv)?[^\S\n]*\n/i, '').replace(/\n```\s*$/, '');
  if (text.trim() === '') throw new Error(t.import.empty);
  let data: unknown;
  let session: ImportedSession | null = null;
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    try { data = JSON.parse(text); }
    catch { throw new Error(t.import.invalidJson); }
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && ('errors' in data || 'session' in data)) {
      if ('errors' in data && !('session' in data)) data = data.errors;
      else {
        const envelope = importEnvelopeSchema(today, t).safeParse(data, importParseOptions(t));
        if (!envelope.success) throw new Error(t.import.invalidEnvelope(importIssues(envelope.error, t)));
        session = envelope.data.session;
        data = envelope.data.errors;
      }
    } else if (!Array.isArray(data)) data = [data];
  } else {
    if (!text.includes('\t')) throw new Error(t.import.freeText);
    const rows = readTable(text, t);
    const first = rows[0] ?? [];
    const mapped = first.map((cell) => headers[normalize(cell).toLowerCase().replace(/[\s_]/g, '')]);
    const hasHeader = mapped.includes('prompt') && mapped.includes('correctAnswer');
    const fields = hasHeader ? mapped : columns;
    if (hasHeader && (fields.some((field) => field === undefined) || new Set(fields).size !== fields.length)) {
      throw new Error(t.import.unknownColumns);
    }
    data = (hasHeader ? rows.slice(1) : rows).map((values, index) => {
      if (values.length !== fields.length && (hasHeader || values.length !== 6)) {
        throw new Error(t.import.rowColumns(index + 1));
      }
      return Object.fromEntries(values.map((value, i) => [fields[i], value]));
    });
  }
  // El sobre admite mas filas que el array suelto: el aviso tiene que decir su propio limite.
  const limit = session === null ? MAX_IMPORT_ROWS : MAX_SESSION_IMPORT_ROWS;
  const parsed = (session === null ? importBatchSchema : sessionImportRowsSchema(t)).safeParse(data, importParseOptions(t));
  if (!parsed.success) {
    throw new Error(t.import.rowCount(limit));
  }
  const errors = parsed.data.map((row, index) => {
    // Una celda en blanco de Causa o Confianza equivale a no traer la columna: vale la propuesta.
    const cause = normalize(row.cause) || DEFAULT_CAUSE;
    const confidence = normalize(row.confidence) || DEFAULT_CONFIDENCE;
    if (!CAUSES.some((value) => value === cause) || !CONFIDENCES.some((value) => value === confidence)) {
      throw new Error(t.import.unknownCauseOrConfidence(index + 1));
    }
    return { ...row, cause, confidence, category: normalize(row.category).replace(/\s+/g, '_') };
  });
  return { session, errors };
}

/**
 * Fila de ejemplo de la plantilla. Es contenido de muestra, igual en los dos idiomas: lo
 * que cambia con la interfaz son las cabeceras, que el importador acepta en ambos.
 */
const TEMPLATE_EXAMPLE = '4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar; se escribe con doble f.';

export function importTemplate(t: Messages): string {
  return `${t.import.templateHeaders.join('\t')}\n${TEMPLATE_EXAMPLE}`;
}

/**
 * El ejemplo del prompt es el contrato con el importador: nombres de campo, tipos y valores
 * no cambian con el idioma. Un test comprueba que el importador lo acepta tal cual.
 */
const PROMPT_EXAMPLE = `{
  "session": {
    "date": "2026-09-15",
    "kind": "DRILL",
    "paper": null,
    "part": null,
    "source": "LIBRO",
    "sourceRef": "Unidad 1, pag. 6, ejercicios 1-5",
    "itemsTotal": 8,
    "itemsCorrect": 6,
    "timed": false
  },
  "errors": [
    {
      "itemRef": "4",
      "prompt": "They called ___ the meeting.",
      "myAnswer": "of",
      "correctAnswer": "off",
      "category": "PHRASAL_VERB",
      "subcategory": "",
      "ruleNote": "Call off significa cancelar; se escribe con doble f."
    }
  ]
}`;

/** Instrucciones para preparar una tanda con una IA externa. La app no llama a ninguna. */
export function importPrompt(t: Messages): string {
  return t.import.aiPrompt({
    example: PROMPT_EXAMPLE,
    kinds: SESSION_KINDS.join(', '),
    papers: PAPERS.join(', '),
    sources: SOURCES.join(', '),
    categories: CATEGORIES.join(', '),
    causes: CAUSES.join(', '),
    confidences: CONFIDENCES.join(', '),
    maxRows: MAX_SESSION_IMPORT_ROWS,
  });
}
