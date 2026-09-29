import { z } from 'zod';

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
      .min(1, 'No puede estar vacío')
      .refine((value) => characterCount(value) <= maxLength,
        `Máximo ${String(maxLength)} caracteres`)
      .refine((value) => !singleLineControl.test(value), 'No admite caracteres de control'),
  );
}

export const notebookFolderNameSchema = label(NOTEBOOK_LIMITS.folderName)
  .refine((value) => characterCount(normalizeFolderNameKey(value)) <= NOTEBOOK_LIMITS.folderName,
    `Máximo ${String(NOTEBOOK_LIMITS.folderName)} caracteres tras normalizar`);
export const notebookTitleSchema = label(NOTEBOOK_LIMITS.title);
export const notebookTagSchema = label(NOTEBOOK_LIMITS.tagLength)
  .transform((value) => value.toLowerCase().normalize('NFC'))
  .pipe(z.string().refine((value) => characterCount(value) <= NOTEBOOK_LIMITS.tagLength,
    `Máximo ${String(NOTEBOOK_LIMITS.tagLength)} caracteres`));

export const notebookTagsSchema = z.array(notebookTagSchema)
  .max(NOTEBOOK_LIMITS.tagCount, `Máximo ${String(NOTEBOOK_LIMITS.tagCount)} etiquetas`)
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    tags.forEach((tag, index) => {
      if (seen.has(tag)) {
        ctx.addIssue({ code: 'custom', path: [index], message: 'Etiqueta duplicada' });
      }
      seen.add(tag);
    });
  });

/** Se conserva el Markdown original: no se recorta ni se normalizan sus saltos. */
export const notebookContentSchema = z.string()
  .refine((value) => !multilineControl.test(value), 'Contiene caracteres de control')
  .refine(
    (value) => new TextEncoder().encode(value).length <= NOTEBOOK_LIMITS.contentBytes,
    `Máximo ${String(NOTEBOOK_LIMITS.contentBytes)} bytes UTF-8`,
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
        `Máximo ${String(NOTEBOOK_LIMITS.searchQuery)} caracteres`)
      .refine((value) => !singleLineControl.test(value), 'Consulta inválida'),
  ),
  folderId: safeId.nullable().default(null),
  unfiledOnly: z.boolean().optional(),
  tag: notebookTagSchema.nullable().default(null),
  page: safeId.default(1),
});

export type CreateNotebookNoteInput = z.output<typeof createNotebookNoteSchema>;
export type SaveNotebookNoteInput = z.output<typeof saveNotebookNoteSchema>;
export type DeleteNotebookNoteInput = z.output<typeof deleteNotebookNoteSchema>;
export type CreateNotebookFolderInput = z.output<typeof createNotebookFolderSchema>;
export type UpdateNotebookFolderInput = z.output<typeof updateNotebookFolderSchema>;
export type SearchNotebookInput = z.output<typeof searchNotebookSchema>;
