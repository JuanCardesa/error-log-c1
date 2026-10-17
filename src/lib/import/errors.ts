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

/** Un dato de la tanda que no vale, con la etiqueta que se ve en la interfaz. */
export interface ImportIssue {
  /** Línea del texto pegado en la que está el dato, si se conoce. */
  readonly line: number | null;
  readonly field: string;
  readonly message: string;
}

/** Una tanda que no se puede revisar: cada dato que no vale, en su línea. */
export class ImportProblem extends Error {
  readonly issues: readonly ImportIssue[];

  constructor(message: string, issues: readonly ImportIssue[]) {
    super(message);
    this.name = 'ImportProblem';
    this.issues = issues;
  }
}

type Label = (t: Messages) => string;

const SESSION_FIELDS: Readonly<Record<string, Label>> = {
  date: (t) => t.sessionForm.date,
  kind: (t) => t.sessionForm.kind,
  paper: (t) => t.sessionForm.examFormat,
  part: (t) => t.sessionForm.part,
  source: (t) => t.sessionForm.source,
  sourceRef: (t) => t.sessionForm.reference,
  itemsTotal: (t) => t.sessionForm.itemsAttempted,
  itemsCorrect: (t) => t.sessionForm.correct,
  timed: (t) => t.sessionForm.timed,
};

const ERROR_FIELDS: Readonly<Record<string, Label>> = {
  itemRef: (t) => t.errorForm.item,
  prompt: (t) => t.errorForm.prompt,
  myAnswer: (t) => t.correction.yourAnswer,
  correctAnswer: (t) => t.correction.correction,
  category: (t) => t.errorForm.category,
  ruleNote: (t) => t.errorForm.rule,
  cause: (t) => t.errorForm.cause,
  confidence: (t) => t.errorForm.confidence,
  subcategory: (t) => t.errorForm.subcategory,
  lateInSession: (t) => t.errorForm.lateInSession,
};

// Lo que admite cada campo cuando llega con otro tipo.
const EXPECTED: Readonly<Record<string, keyof Messages['import']['expected']>> = {
  date: 'date', part: 'intOrNull', itemsTotal: 'intOrNull', itemsCorrect: 'intOrNull',
  timed: 'boolean', sourceRef: 'textOrNull', prompt: 'text', correctAnswer: 'text', ruleNote: 'text',
  errors: 'list',
};

// El valor se escribe tal cual; la etiqueta solo se añade cuando dice algo más.
const OPTION_LABELS: Readonly<Record<string, (t: Messages) => Readonly<Record<string, string>>>> = {
  kind: (t) => t.labels.kind,
  paper: (t) => t.labels.paperLong,
  source: (t) => t.labels.source,
};

function fieldLabel(path: readonly PropertyKey[], t: Messages): string {
  const [head, second, third] = path;
  if (head === undefined) return t.import.envelope;
  if (head === 'session') {
    if (second === undefined) return t.import.sessionField;
    return SESSION_FIELDS[String(second)]?.(t) ?? String(second);
  }
  if (head === 'errors' && second === undefined) return t.import.errorsField;
  const [row, field] = head === 'errors' ? [second, third] : [head, second];
  if (typeof row !== 'number') return path.map(String).join('.');
  return t.import.rowField(row + 1, field === undefined ? null : ERROR_FIELDS[String(field)]?.(t) ?? String(field));
}

function shown(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

function issueMessage(issue: z.core.$ZodIssue, value: unknown, t: Messages): string {
  const field = String(issue.path.at(-1) ?? '');
  if (issue.code === 'unrecognized_keys') return t.import.unknownFields(issue.keys.join(', '));
  if (issue.code === 'invalid_value') {
    const labels = OPTION_LABELS[field]?.(t) ?? {};
    const options = issue.values.map((option) => {
      const code = String(option);
      const label = labels[code];
      return label === undefined || label.toLowerCase() === code.toLowerCase() ? code : `${code} (${label})`;
    });
    return t.import.notInList(shown(value), new Intl.ListFormat(t.format.intl, { type: 'disjunction' }).format(options));
  }
  if (issue.code === 'invalid_type') {
    if (value === undefined) return t.import.missingField;
    const expected = EXPECTED[field];
    if (expected !== undefined) return t.import.mustBe(shown(value), t.import.expected[expected]);
  }
  return issue.message;
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let node = data;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node;
}

/**
 * Cada problema de una tanda con la etiqueta de su campo y un mensaje sin los valores
 * internos de Zod. Con `locate`, también la línea del texto pegado.
 */
export function describeIssues(
  error: z.ZodError,
  data: unknown,
  t: Messages,
  locate: (path: readonly PropertyKey[]) => number | null = () => null,
): ImportIssue[] {
  return error.issues.map((issue) => {
    // Un campo que sobra se señala en su línea, no en la del objeto que lo trae.
    const first = issue.code === 'unrecognized_keys' ? issue.keys[0] : undefined;
    return {
      line: locate(first === undefined ? issue.path : [...issue.path, first]),
      field: fieldLabel(issue.path, t),
      message: issueMessage(issue, valueAt(data, issue.path), t),
    };
  });
}

export function importIssues(error: z.ZodError, data: unknown, t: Messages): string {
  return describeIssues(error, data, t).map((issue) => `${issue.field}: ${issue.message}`).join('; ');
}

/**
 * Línea (desde 1) en la que empieza el valor de `path` en un JSON que `JSON.parse` ya
 * aceptó. Si el camino no llega hasta el final (un campo que falta), la de su padre.
 */
export function jsonLine(text: string, path: readonly PropertyKey[]): number {
  let at = 0;
  let line = 1;
  const space = () => {
    while (at < text.length && /\s/.test(text.charAt(at))) {
      if (text.charAt(at) === '\n') line += 1;
      at += 1;
    }
  };
  const string = (): string => {
    const start = at;
    at += 1;
    while (at < text.length && text.charAt(at) !== '"') at += text.charAt(at) === '\\' ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  // Con `depth`, sigue el camino y devuelve la línea buscada; con null, solo avanza.
  const value = (depth: number | null): number | null => {
    space();
    const start = line;
    if (depth === path.length) return start;
    const open = text.charAt(at);
    if (open === '{' || open === '[') {
      const close = open === '{' ? '}' : ']';
      at += 1;
      space();
      for (let index = 0; at < text.length && text.charAt(at) !== close; index += 1) {
        let key = String(index);
        if (open === '{') {
          key = string();
          space();
          at += 1;
        }
        const follows = depth !== null && String(path[depth]) === key;
        const found = value(follows ? depth + 1 : null);
        if (follows) return found ?? start;
        space();
        if (text.charAt(at) === ',') at += 1;
        space();
      }
      at += 1;
    } else if (open === '"') {
      string();
    } else {
      while (at < text.length && !/[\s,\]}]/.test(text.charAt(at))) at += 1;
    }
    return depth === null ? null : start;
  };
  return value(0) ?? 1;
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
  const pasted = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const text = pasted.replace(/^\n+|\n+$/g, '')
    .replace(/^\s*```(?:json|tsv)?[^\S\n]*\n/i, '').replace(/\n```\s*$/, '');
  // Las líneas de un aviso cuentan lo pegado, con la valla de Markdown y los saltos iniciales.
  const leadLines = pasted.slice(0, Math.max(0, pasted.indexOf(text))).split('\n').length - 1;
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
        if (!envelope.success) {
          const issues = describeIssues(envelope.error, data, t, (path) => jsonLine(text, path) + leadLines);
          throw new ImportProblem(t.import.invalidEnvelope(issues.length), issues);
        }
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
