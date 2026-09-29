import { describe, expect, it } from 'vitest';

import {
  NOTEBOOK_LIMITS,
  createNotebookFolderSchema,
  createNotebookNoteSchema,
  deleteNotebookNoteSchema,
  normalizeFolderNameKey,
  notebookContentSchema,
  notebookTagsSchema,
  saveNotebookNoteSchema,
  searchNotebookSchema,
  updateNotebookFolderSchema,
} from './schemas';

const UID = '9c8de1e3-03e6-42ec-a098-ac0db92331d0';

function note() {
  return {
    uid: UID,
    title: '  Past modal verbs  ',
    contentMarkdown: '# Must have\n\tAn example.\r\n',
  };
}

describe('contrato de apuntes', () => {
  it('normaliza los metadatos sin modificar el Markdown', () => {
    expect(createNotebookNoteSchema.parse({
      ...note(),
      tags: ['  PAST-MODALS ', 'Part4'],
    })).toEqual({
      uid: UID,
      title: 'Past modal verbs',
      folderId: null,
      contentMarkdown: note().contentMarkdown,
      tags: ['past-modals', 'part4'],
    });
  });

  it('admite cuerpo vacío y límites exactos', () => {
    expect(createNotebookNoteSchema.safeParse({
      ...note(),
      title: 'T'.repeat(NOTEBOOK_LIMITS.title),
      contentMarkdown: 'a'.repeat(NOTEBOOK_LIMITS.contentBytes),
    }).success).toBe(true);
    expect(createNotebookNoteSchema.safeParse({
      ...note(),
      contentMarkdown: '',
    }).success).toBe(true);
    expect(createNotebookNoteSchema.safeParse({
      ...note(),
      title: '📚'.repeat(NOTEBOOK_LIMITS.title),
    }).success).toBe(true);
  });

  it('mide el contenido en bytes UTF-8 y conserva saltos y tabulaciones', () => {
    expect(notebookContentSchema.safeParse('á'.repeat(NOTEBOOK_LIMITS.contentBytes / 2)).success)
      .toBe(true);
    expect(notebookContentSchema.safeParse('á'.repeat(NOTEBOOK_LIMITS.contentBytes / 2 + 1)).success)
      .toBe(false);
    expect(notebookContentSchema.safeParse('uno\n\tdos\r\n').success).toBe(true);
    expect(notebookContentSchema.safeParse('uno\u0000dos').success).toBe(false);
    expect(notebookContentSchema.safeParse('uno\u000bdos').success).toBe(false);
  });

  it.each([
    { uid: 'no-uuid' },
    { title: '  ' },
    { title: 'a'.repeat(NOTEBOOK_LIMITS.title + 1) },
    { title: 'Título\nnuevo' },
    { contentMarkdown: 42 },
    { folderId: 0 },
    { folderId: 1.5 },
    { folderId: Number.MAX_SAFE_INTEGER + 1 },
    { id: 5 },
  ])('rechaza entrada inválida o campos reservados: %j', (changes) => {
    expect(createNotebookNoteSchema.safeParse({ ...note(), ...changes }).success).toBe(false);
  });

  it('exige ID, UID y revisión positiva para guardar o borrar', () => {
    expect(saveNotebookNoteSchema.safeParse({ id: 1, expectedRevision: 1, ...note() }).success)
      .toBe(true);
    expect(saveNotebookNoteSchema.safeParse({ id: 1, expectedRevision: 0, ...note() }).success)
      .toBe(false);
    expect(deleteNotebookNoteSchema.safeParse({ id: 1, uid: UID, expectedRevision: 2 }).success)
      .toBe(true);
    expect(deleteNotebookNoteSchema.safeParse({ id: 1, uid: 'x', expectedRevision: 2 }).success)
      .toBe(false);
  });
});

describe('etiquetas y carpetas', () => {
  it('normaliza Unicode y caja para detectar duplicados', () => {
    expect(notebookTagsSchema.safeParse([' PAST ', 'past']).success).toBe(false);
    expect(notebookTagsSchema.safeParse(['Café', 'Cafe\u0301']).success).toBe(false);
    expect(notebookTagsSchema.parse(['FORMAL', ' part4 '])).toEqual(['formal', 'part4']);
  });

  it('aplica máximo de etiquetas y longitud por etiqueta', () => {
    expect(notebookTagsSchema.safeParse(Array.from({ length: NOTEBOOK_LIMITS.tagCount },
      (_, i) => `tag-${String(i)}`)).success).toBe(true);
    expect(notebookTagsSchema.safeParse(Array.from({ length: NOTEBOOK_LIMITS.tagCount + 1 },
      (_, i) => `tag-${String(i)}`)).success).toBe(false);
    expect(notebookTagsSchema.safeParse(['x'.repeat(NOTEBOOK_LIMITS.tagLength + 1)]).success)
      .toBe(false);
    expect(notebookTagsSchema.safeParse([`${'x'.repeat(NOTEBOOK_LIMITS.tagLength - 1)}İ`]).success)
      .toBe(false);
    expect(notebookTagsSchema.safeParse(['  ']).success).toBe(false);
    expect(notebookTagsSchema.safeParse(['part\u007f4']).success).toBe(false);
  });

  it('produce la misma clave para nombres equivalentes', () => {
    expect(normalizeFolderNameKey('  GRAMMAR ')).toBe('grammar');
    expect(normalizeFolderNameKey('Cafe\u0301')).toBe(normalizeFolderNameKey('CAFÉ'));
    expect(createNotebookFolderSchema.parse({ name: '  Grammar  ' }))
      .toEqual({ name: 'Grammar', parentId: null });
  });

  it('rechaza carpetas sin nombre, demasiado largas o padres inválidos', () => {
    expect(createNotebookFolderSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createNotebookFolderSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    expect(createNotebookFolderSchema.safeParse({ name: 'İ'.repeat(80) }).success).toBe(false);
    expect(createNotebookFolderSchema.safeParse({ name: 'x', parentId: -1 }).success).toBe(false);
    expect(updateNotebookFolderSchema.safeParse({ id: 1, name: 'A', parentId: null }).success)
      .toBe(true);
    expect(updateNotebookFolderSchema.safeParse({ id: 1, name: 'A' }).success).toBe(false);
  });
});

describe('búsqueda', () => {
  it('normaliza consulta y filtros y usa la primera página', () => {
    expect(searchNotebookSchema.parse({ query: '  must have  ', tag: ' GRAMMAR ' }))
      .toEqual({ query: 'must have', folderId: null, tag: 'grammar', page: 1 });
    expect(searchNotebookSchema.safeParse({ query: '' }).success).toBe(true);
  });

  it('limita consulta y página', () => {
    expect(searchNotebookSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false);
    expect(searchNotebookSchema.safeParse({ query: '📚'.repeat(200) }).success).toBe(true);
    expect(searchNotebookSchema.safeParse({ query: 'x', page: 0 }).success).toBe(false);
    expect(searchNotebookSchema.safeParse({ query: 'x\ny' }).success).toBe(false);
  });
});
