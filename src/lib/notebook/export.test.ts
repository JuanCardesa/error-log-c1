import { describe, expect, it } from 'vitest';

import {
  notebookFolderDirName, notebookFrontmatter, notebookNoteFileName, notebookNoteToMarkdown,
} from './export';
import { parseNotebookMarkdownImport } from './import';
import type { NotebookNote } from './types';

const UID = '9c8de1e3-03e6-42ec-a098-ac0db92331d0';

function note(changes: Partial<NotebookNote> = {}): NotebookNote {
  return {
    id: 42,
    uid: UID,
    folderId: null,
    title: 'Past modal verbs',
    contentMarkdown: '# Past modal verbs\n\n## Must have\n\nA deduction.\n',
    tags: ['past-modals', 'part4'],
    revision: 3,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-28T18:30:00.000Z',
    ...changes,
  };
}

describe('nombres de fichero', () => {
  it('lleva el ID delante, así que títulos repetidos no chocan', () => {
    expect(notebookNoteFileName(note())).toBe('42-past-modal-verbs.md');
    expect(notebookNoteFileName(note({ id: 7 }))).toBe('7-past-modal-verbs.md');
  });

  it('quita lo que Windows no admite y conserva acentos y otros alfabetos', () => {
    expect(notebookNoteFileName(note({ title: 'a/b\\c<d>e:f"g|h?i*j' }))).toBe('42-abcdefghij.md');
    expect(notebookNoteFileName(note({ title: 'Condicionales: ¿cuándo?' }))).toBe('42-condicionales-cuándo.md');
    expect(notebookNoteFileName(note({ title: '日本語' }))).toBe('42-日本語.md');
  });

  it('un nombre reservado de Windows nunca queda solo', () => {
    expect(notebookNoteFileName(note({ title: 'CON' }))).toBe('42-con.md');
    expect(notebookFolderDirName({ id: 3, name: 'NUL' })).toBe('nul--3');
  });

  it('un título sin nada utilizable deja solo el ID', () => {
    for (const title of ['...', '---', '   ']) {
      expect(notebookNoteFileName(note({ title }))).toBe('42.md');
      expect(notebookFolderDirName({ id: 3, name: title })).toBe('3');
    }
  });

  it('recorta los títulos largos sin dejar guiones al final', () => {
    const long = notebookNoteFileName(note({ title: `${'ab '.repeat(60)}fin` }));
    expect(long.length).toBeLessThanOrEqual(3 + 60 + 3);
    expect(long).toMatch(/^42-(?:ab-)+ab\.md$/u);
    expect(notebookFolderDirName({ id: 3, name: 'x'.repeat(100) })).toBe(`${'x'.repeat(40)}--3`);
  });

  it('la carpeta ordena por nombre y desempata por ID', () => {
    expect(notebookFolderDirName({ id: 1, name: 'Grammar' })).toBe('grammar--1');
    expect([
      notebookFolderDirName({ id: 9, name: 'Grammar' }),
      notebookFolderDirName({ id: 2, name: 'Grammar' }),
    ].sort((a, b) => a.localeCompare(b))).toEqual(['grammar--2', 'grammar--9']);
  });
});

describe('frontmatter', () => {
  it('escribe los campos del contrato y conserva el cuerpo tal cual', () => {
    expect(notebookNoteToMarkdown(note())).toBe([
      '---',
      'title: "Past modal verbs"',
      'tags:',
      '  - "past-modals"',
      '  - "part4"',
      'notebook_uid: "9c8de1e3-03e6-42ec-a098-ac0db92331d0"',
      'created_at: "2026-09-01T10:00:00.000Z"',
      'updated_at: "2026-09-28T18:30:00.000Z"',
      '---',
      '# Past modal verbs',
      '',
      '## Must have',
      '',
      'A deduction.',
      '',
    ].join('\n'));
  });

  it('no incluye la revisión ni la carpeta: el apunte importado será otro', () => {
    expect(Object.keys(notebookFrontmatter(note({ folderId: 4 })))).toEqual([
      'title', 'tags', 'notebook_uid', 'created_at', 'updated_at',
    ]);
  });

  it('un apunte sin etiquetas ni cuerpo sale con la lista vacía', () => {
    const text = notebookNoteToMarkdown(note({ tags: [], contentMarkdown: '' }));
    expect(text).toContain('tags: []');
    expect(text.endsWith('---\n')).toBe(true);
  });

  it('conserva CRLF, tabulaciones y un cuerpo sin salto final', () => {
    const body = '# Título\r\n\n\tcódigo — «cita»\r\nsin salto final';
    expect(notebookNoteToMarkdown(note({ contentMarkdown: body })).endsWith(`---\n${body}`)).toBe(true);
  });
});

describe('ida y vuelta con el importador', () => {
  function reimport(value: NotebookNote) {
    const text = notebookNoteToMarkdown(value);
    const result = parseNotebookMarkdownImport(notebookNoteFileName(value), new TextEncoder().encode(text));
    if (!result.ok) throw new Error(result.message);
    return result.draft;
  }

  it('devuelve título, etiquetas y cuerpo, y reconoce la identidad como ajena', () => {
    const draft = reimport(note());
    expect(draft).toMatchObject({
      title: 'Past modal verbs', titleSource: 'frontmatter', tags: ['past-modals', 'part4'],
      contentMarkdown: note().contentMarkdown, frontmatter: 'applied', unknownFields: [], warnings: [],
    });
    expect(draft.ignoredFields).toEqual(['notebook_uid', 'created_at', 'updated_at']);
  });

  it.each([
    ['comillas y almohadillas', 'Un "título" raro: #1 {y} [más]'],
    ['algo que parece YAML', '--- title: no'],
    ['dos puntos y guiones', '- a: b'],
    ['un número', '2026'],
    ['acentos y CJK', 'Pretérito — 日本語'],
  ])('un título con %s vuelve igual', (_name, title) => {
    expect(reimport(note({ title })).title).toBe(title);
  });

  it('un cuerpo que empieza por --- no se confunde con el cierre del frontmatter', () => {
    const body = '---\nesto es cuerpo, no metadatos\n';
    expect(reimport(note({ contentMarkdown: body }))).toMatchObject({ title: 'Past modal verbs', contentMarkdown: body });
  });
});
