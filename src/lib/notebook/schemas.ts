import { z } from 'zod';

import type { Messages } from '../i18n';
import { localized } from '../i18n/zod';

export const NOTEBOOK_LIMITS = {
  folderName: 80,
  title: 160,
  contentBytes: 256 * 1024,
  tagCount: 12,
  tagLength: 40,
  searchQuery: 200,
  pageSize: 20,
  frontmatterBytes: 8 * 1024,
} as const;

/** Cuerpo y frontmatter máximos, más holgura para delimitadores, BOM y líneas en blanco. */
export const NOTEBOOK_IMPORT_MAX_FILE_BYTES = NOTEBOOK_LIMITS.contentBytes + NOTEBOOK_LIMITS.frontmatterBytes + 1024;
export const NOTEBOOK_IMPORT_ACCEPT = '.md,.markdown,text/markdown';

/** El navegador lo comprueba antes de enviar; el servidor lo repite antes de leer el archivo. */
export function notebookImportSizeError(bytes: number, t: Messages): string | null {
  return bytes > NOTEBOOK_IMPORT_MAX_FILE_BYTES
    ? t.notebookImport.fileTooBig(Math.floor(NOTEBOOK_IMPORT_MAX_FILE_BYTES / 1024))
    : null;
}

/*
 * Los mensajes no se escriben aquí: estos esquemas son constantes y no saben en qué idioma
 * se leerán. `localized` deja el texto como función del diccionario, y quien valida pasa
 * `zodErrors(t)` o `formErrors(t)` para redactarlo. Un texto vacío lo dice ese mismo mapa.
 */

const singleLineControl = /[\u0000-\u001f\u007f]/u;
const multilineControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const safeId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const saveRevision = safeId.max(Number.MAX_SAFE_INTEGER - 1);
const uid = z.uuid();

function normalizeLabel(value: string): string {
  return value.normalize('NFC').trim();
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

/** El mismo cálculo debe usarse en el repositorio al escribir nameKey. */
export function normalizeFolderNameKey(value: string): string {
  return normalizeLabel(value).toLowerCase().normalize('NFC');
}

function label(maxLength: number) {
  return z.string().transform(normalizeLabel).pipe(
    z.string()
      .min(1)
      .refine((value) => characterCount(value) <= maxLength,
        localized((t) => t.validation.maxChars(maxLength)))
      .refine((value) => !singleLineControl.test(value), localized((t) => t.validation.noControlChars)),
  );
}

export const notebookFolderNameSchema = label(NOTEBOOK_LIMITS.folderName)
  .refine((value) => characterCount(normalizeFolderNameKey(value)) <= NOTEBOOK_LIMITS.folderName,
    localized((t) => t.validation.maxCharsNormalized(NOTEBOOK_LIMITS.folderName)));
export const notebookTitleSchema = label(NOTEBOOK_LIMITS.title);
export const notebookTagSchema = label(NOTEBOOK_LIMITS.tagLength)
  .transform((value) => value.toLowerCase().normalize('NFC'))
  .pipe(z.string().refine((value) => characterCount(value) <= NOTEBOOK_LIMITS.tagLength,
    localized((t) => t.validation.maxChars(NOTEBOOK_LIMITS.tagLength))));

export const notebookTagsSchema = z.array(notebookTagSchema)
  .refine((tags) => tags.length <= NOTEBOOK_LIMITS.tagCount, localized((t) => t.validation.maxTags(NOTEBOOK_LIMITS.tagCount)))
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    tags.forEach((tag, index) => {
      if (seen.has(tag)) {
        ctx.addIssue({ code: 'custom', path: [index], ...localized((t) => t.validation.duplicateTag) });
      }
      seen.add(tag);
    });
  });

/** Se conserva el Markdown original: no se recorta ni se normalizan sus saltos. */
export const notebookContentSchema = z.string()
  .refine((value) => !multilineControl.test(value), localized((t) => t.validation.containsControlChars))
  .refine(
    (value) => new TextEncoder().encode(value).length <= NOTEBOOK_LIMITS.contentBytes,
    localized((t) => t.validation.maxBytes(NOTEBOOK_LIMITS.contentBytes)),
  );

const noteFields = {
  uid,
  title: notebookTitleSchema,
  folderId: safeId.nullable().default(null),
  tags: notebookTagsSchema.default([]),
  contentMarkdown: notebookContentSchema,
};

export const createNotebookNoteSchema = z.strictObject(noteFields);
export const saveNotebookNoteSchema = z.strictObject({
  id: safeId,
  expectedRevision: saveRevision,
  ...noteFields,
});
export const deleteNotebookNoteSchema = z.strictObject({
  id: safeId,
  uid,
  expectedRevision: safeId,
});
export const setNotebookNoteFavoriteSchema = z.strictObject({ id: safeId, favorite: z.boolean() });
export const getNotebookNoteSchema = z.strictObject({
  id: safeId,
  uid: uid.optional(),
});
export const getNotebookNoteByUidSchema = z.strictObject({ uid });
export const finishNotebookEditingSchema = z.strictObject({
  id: safeId,
  uid,
  expectedRevision: safeId,
  previousTitle: notebookTitleSchema.optional(),
});
export const getNotebookOutlineSchema = z.strictObject({ id: safeId });
export const getErrorNoteLinksSchema = z.strictObject({ errorId: safeId });
export const getNoteErrorLinksSchema = z.strictObject({ noteId: safeId, page: safeId.default(1) });
export const setErrorNoteLinkSchema = z.strictObject({
  errorId: safeId,
  noteId: safeId,
  headingSlug: z.string().startsWith('nb-').max(NOTEBOOK_LIMITS.contentBytes).nullable().default(null),
});
export const removeErrorNoteLinkSchema = z.strictObject({ errorId: safeId, noteId: safeId });

export const createNotebookFolderSchema = z.strictObject({
  name: notebookFolderNameSchema,
  parentId: safeId.nullable().default(null),
});
export const updateNotebookFolderSchema = z.strictObject({
  id: safeId,
  name: notebookFolderNameSchema,
  parentId: safeId.nullable(),
});
export const deleteNotebookFolderSchema = z.strictObject({ id: safeId });

export const searchNotebookSchema = z.strictObject({
  query: z.string().transform(normalizeLabel).pipe(
    z.string()
      .refine((value) => characterCount(value) <= NOTEBOOK_LIMITS.searchQuery,
        localized((t) => t.validation.maxChars(NOTEBOOK_LIMITS.searchQuery)))
      .refine((value) => !singleLineControl.test(value), localized((t) => t.validation.invalidQuery)),
  ),
  folderId: safeId.nullable().default(null),
  unfiledOnly: z.boolean().optional(),
  tag: notebookTagSchema.nullable().default(null),
  page: safeId.default(1),
});

export type CreateNotebookNoteInput = z.output<typeof createNotebookNoteSchema>;
export type SaveNotebookNoteInput = z.output<typeof saveNotebookNoteSchema>;
export type DeleteNotebookNoteInput = z.output<typeof deleteNotebookNoteSchema>;
export type SetNotebookNoteFavoriteInput = z.output<typeof setNotebookNoteFavoriteSchema>;
export type CreateNotebookFolderInput = z.output<typeof createNotebookFolderSchema>;
export type UpdateNotebookFolderInput = z.output<typeof updateNotebookFolderSchema>;
export type SearchNotebookInput = z.output<typeof searchNotebookSchema>;
export type SetErrorNoteLinkInput = z.output<typeof setErrorNoteLinkSchema>;
export type RemoveErrorNoteLinkInput = z.output<typeof removeErrorNoteLinkSchema>;
