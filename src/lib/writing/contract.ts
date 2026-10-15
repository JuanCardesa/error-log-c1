import { z } from 'zod';

import { ANNOTATION_FOCUSES, ANNOTATION_KINDS, CORRECTORS, GENRES, WRITING_STATUSES } from '../domain/enums';
import type { Messages } from '../i18n';
import { importParseOptions } from '../import/errors';
import { isIsoDate } from '../time/dates';
import { BAND_STEP, WRITING_LIMITS } from './limits';
import { normalizeWritingText } from './text';

/**
 * Contrato JSON v1 para importar una redacción (docs/WRITING-PLAN.md §6). Lo genera una IA
 * a partir de fotografías, así que todo llega sin confianza: el esquema es estricto, una
 * clave desconocida se rechaza y una opcional puede omitirse o ir a `null`, que valen lo
 * mismo: «no lo sé», nunca «bórralo».
 */

export const WRITING_FORMAT = 'error-log-writing';
export const WRITING_FORMAT_VERSION = 1;
export const MAX_WRITING_IMPORT_LENGTH = WRITING_LIMITS.importChars;
/** Contexto de una cita: unas palabras, no un párrafo. */
const MAX_CONTEXT = 200;

/** Controles salvo el tabulador y el salto de línea, que sí son parte de un texto. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

const absent = <T>(value: T | null | undefined): T | null => value ?? null;

function optionalText(max: number, t: Messages) {
  return z.string().trim().max(max)
    .refine((value) => !CONTROL.test(value), { message: t.validation.containsControlChars })
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value));
}

function isoDate(today: string, t: Messages) {
  return z.string()
    .refine(isIsoDate, { message: t.validation.invalidDate })
    .refine((value) => value <= today, { message: t.validation.futureDate });
}

function score(t: Messages) {
  return z.number().min(0).max(5).multipleOf(BAND_STEP, { message: t.validation.halfPoints }).nullish().transform(absent);
}

function target(t: Messages) {
  const position = z.number().int().min(1).nullish().transform(absent);
  const context = z.string().max(MAX_CONTEXT).nullish().transform(absent);
  return z.discriminatedUnion('scope', [
    z.strictObject({ scope: z.literal('DOCUMENT') }),
    z.strictObject({ scope: z.literal('PARAGRAPH'), paragraph: z.number().int().min(1) }),
    z.strictObject({
      scope: z.literal('SPAN'),
      // Sin blancos en los bordes: no forman parte de lo que se resalta.
      quote: z.string().trim().min(1).max(WRITING_LIMITS.text),
      paragraph: position,
      occurrence: position,
      before: context,
      after: context,
      start: z.number().int().min(0).nullish().transform(absent),
      end: z.number().int().min(1).nullish().transform(absent),
    }).refine((value) => (value.start === null) === (value.end === null)
      && (value.start === null || value.end === null || value.end > value.start), {
      message: t.writingImport.startEnd, path: ['end'],
    }),
  ]);
}

function annotation(t: Messages) {
  return z.strictObject({
    id: z.uuid().nullish().transform(absent),
    kind: z.enum(ANNOTATION_KINDS),
    focus: z.enum(ANNOTATION_FOCUSES).nullish().transform(absent),
    source: z.enum(CORRECTORS),
    target: target(t),
    comment: optionalText(WRITING_LIMITS.annotationNote, t),
    suggestion: optionalText(WRITING_LIMITS.annotationNote, t),
    reviewedAt: z.iso.datetime().nullish().transform(absent),
  }).refine((value) => value.comment !== null || value.suggestion !== null
    || (value.kind === 'STRENGTH' && value.focus !== null), {
    message: t.writingImport.needsContent, path: ['comment'],
  });
}

export function writingImportSchema(today: string, t: Messages) {
  const date = isoDate(today, t);
  return z.strictObject({
    format: z.literal(WRITING_FORMAT, { error: t.writingImport.wrongFormat }),
    version: z.literal(WRITING_FORMAT_VERSION, { error: t.writingImport.wrongVersion }),
    writing: z.strictObject({
      id: z.uuid().nullish().transform(absent),
      title: z.string().trim().min(1).max(WRITING_LIMITS.title)
        .refine((value) => !CONTROL.test(value), { message: t.validation.containsControlChars }),
      type: z.enum(GENRES),
      writtenOn: date.nullish().transform(absent),
      taskPrompt: optionalText(WRITING_LIMITS.taskPrompt, t),
      // Se guarda tal cual llega, salvo los saltos de Windows y los blancos de los bordes.
      text: z.string().transform(normalizeWritingText).pipe(z.string().min(1).max(WRITING_LIMITS.text)
        .refine((value) => !CONTROL.test(value), { message: t.validation.containsControlChars })),
      wordRange: z.tuple([z.number().int(), z.number().int()]).nullish().transform(absent)
        .refine((range) => range === null || (range[0] >= 1 && range[0] <= range[1] && range[1] <= WRITING_LIMITS.wordRange), {
          message: t.writingImport.wordRange,
        }),
      timed: z.boolean().nullish().transform(absent),
      minutes: z.number().int().min(0).nullish().transform(absent),
    }),
    assessment: z.strictObject({
      status: z.enum(WRITING_STATUSES).nullish().transform(absent),
      assessedBy: z.enum(CORRECTORS).nullish().transform(absent),
      correctedOn: date.nullish().transform(absent),
      scores: z.strictObject({
        content: score(t),
        communicativeAchievement: score(t),
        organisation: score(t),
        language: score(t),
      }).nullish().transform(absent),
      /** Solo para comprobar la suma: el total no se guarda, se calcula. */
      total: z.number().min(0).max(20).nullish().transform(absent),
      teacherComment: optionalText(WRITING_LIMITS.longNote, t),
      personalNotes: optionalText(WRITING_LIMITS.longNote, t),
    }).nullish().transform(absent),
    annotations: z.array(annotation(t))
      .max(WRITING_LIMITS.annotations, { error: t.writingImport.tooManyAnnotations(WRITING_LIMITS.annotations) })
      .nullish().transform((value) => value ?? []),
  }).superRefine((value, ctx) => {
    const written = value.writing.writtenOn;
    const corrected = value.assessment?.correctedOn ?? null;
    if (written !== null && corrected !== null && corrected < written) {
      ctx.addIssue({ code: 'custom', path: ['assessment', 'correctedOn'], message: t.writingImport.correctedBeforeWritten });
    }
  });
}

export type WritingImport = z.output<ReturnType<typeof writingImportSchema>>;
export type ImportedAnnotation = WritingImport['annotations'][number];
export type ImportedTarget = ImportedAnnotation['target'];

export type ReadResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

/**
 * Lo que se pega suele ser la respuesta de la IA entera: se quitan la marca BOM y la valla
 * ```json que la rodea. Cualquier otro texto alrededor hace que no sea JSON.
 */
export function readWritingJson(source: string, t: Messages): ReadResult {
  if (source.length > MAX_WRITING_IMPORT_LENGTH) {
    return { ok: false, message: t.writingImport.tooLong(Math.round(MAX_WRITING_IMPORT_LENGTH / 1024)) };
  }
  const text = source.replace(/^\uFEFF/, '').trim()
    .replace(/^```(?:json)?[^\S\n]*\n/i, '').replace(/\n```$/, '').trim();
  if (text === '') return { ok: false, message: t.writingImport.empty };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: t.writingImport.notJson };
  }
}

export interface ImportIssue {
  /** Ruta en el JSON, como `annotations[4].target.quote`; vacía para el objeto entero. */
  readonly path: string;
  readonly message: string;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number'
    ? `${text}[${String(key)}]`
    : text === '' ? String(key) : `${text}.${String(key)}`), '');
}

export type ParseResult =
  | { readonly ok: true; readonly data: WritingImport }
  | { readonly ok: false; readonly issues: readonly ImportIssue[] };

export function parseWritingImport(value: unknown, today: string, t: Messages): ParseResult {
  const parsed = writingImportSchema(today, t).safeParse(value, importParseOptions(t));
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.code === 'unrecognized_keys' ? t.import.unknownFields(issue.keys.join(', ')) : issue.message,
    })),
  };
}
