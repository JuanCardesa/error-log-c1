import { describe, expect, it } from 'vitest';

import { parseNotebookMarkdownImport, type NotebookImportDraft } from './import';
import { NOTEBOOK_IMPORT_MAX_FILE_BYTES, NOTEBOOK_LIMITS } from './schemas';

const encode = (text: string) => new TextEncoder().encode(text);

function draft(text: string, fileName = 'past-modals.md'): NotebookImportDraft {
  const result = parseNotebookMarkdownImport(fileName, encode(text));
  if (!result.ok) throw new Error(result.message);
  return result.draft;
}

function failure(bytes: Uint8Array, fileName = 'past-modals.md'): string {
  const result = parseNotebookMarkdownImport(fileName, bytes);
  if (result.ok) throw new Error('Se esperaba un rechazo');
  return result.message;
}

const codes = (value: NotebookImportDraft) => value.warnings.map((warning) => warning.code);

describe('archivo', () => {
  it('admite .md y .markdown sin distinguir mayúsculas y usa solo el nombre base', () => {
    expect(draft('Texto', 'C:\\apuntes\\Modales.MD').fileName).toBe('Modales.MD');
    expect(draft('Texto', 'carpeta/modales.markdown').title).toBe('modales');
    expect(failure(encode('Texto'), 'modales.txt')).toMatch(/\.md o \.markdown/u);
    expect(failure(encode('Texto'), 'md')).toMatch(/\.md o \.markdown/u);
  });

  it('rechaza UTF-8 inválido y quita la marca BOM antes de buscar el frontmatter', () => {
    expect(failure(new Uint8Array([0x23, 0x20, 0xc3, 0x28]))).toMatch(/UTF-8/u);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('---\ntitle: Con BOM\n---\nCuerpo')]);
    const result = parseNotebookMarkdownImport('a.md', withBom);
    expect(result.ok && result.draft).toMatchObject({ title: 'Con BOM', frontmatter: 'applied', contentMarkdown: 'Cuerpo' });
  });

  it('conserva acentos, tabulaciones y saltos CRLF del cuerpo', () => {
    expect(draft('# Pasado\r\n\n\tcódigo — «cita»\r\n').contentMarkdown).toBe('# Pasado\r\n\n\tcódigo — «cita»\r\n');
  });

  it('aplica el límite del archivo y el del cuerpo de un apunte', () => {
    expect(failure(new Uint8Array(NOTEBOOK_IMPORT_MAX_FILE_BYTES + 1))).toMatch(/supera/u);
    expect(failure(encode('a'.repeat(NOTEBOOK_LIMITS.contentBytes + 1)))).toMatch(/256 KiB/u);
    expect(draft('a'.repeat(NOTEBOOK_LIMITS.contentBytes)).contentMarkdown).toHaveLength(NOTEBOOK_LIMITS.contentBytes);
    // El frontmatter aplicado no cuenta para el cuerpo.
    const front = `---\nnota: ${'x'.repeat(4000)}\n---\n`;
    expect(draft(`${front}${'a'.repeat(NOTEBOOK_LIMITS.contentBytes)}`).contentMarkdown).toHaveLength(NOTEBOOK_LIMITS.contentBytes);
  });

  it('rechaza caracteres de control que un apunte no admite', () => {
    expect(failure(encode('Texto\u0000oculto'))).toMatch(/caracteres de control/u);
  });

  it('un archivo vacío se importa con el nombre como título', () => {
    expect(draft('', 'vacío.md')).toMatchObject({ title: 'vacío', titleSource: 'file', contentMarkdown: '', frontmatter: 'none' });
  });
});

describe('frontmatter', () => {
  it('aplica título y etiquetas y quita las líneas en blanco que lo separan del cuerpo', () => {
    expect(draft('---\ntitle: Past modal verbs\ntags:\n  - Past-Modals\n  - part4\n---\n\n\n# Must have\n')).toMatchObject({
      title: 'Past modal verbs', titleSource: 'frontmatter', tags: ['past-modals', 'part4'],
      contentMarkdown: '# Must have\n', frontmatter: 'applied', unknownFields: [], warnings: [],
    });
  });

  it('interpreta todo como texto: números y fechas no cambian de forma', () => {
    expect(draft('---\ntitle: 2026\ntags: [1, 2026-09-29]\n---\n')).toMatchObject({ title: '2026', tags: ['1', '2026-09-29'] });
  });

  it('acepta etiquetas separadas por comas y un frontmatter vacío', () => {
    expect(draft('---\ntags: gramática, part4,, gramática\n---\nCuerpo').tags).toEqual(['gramática', 'part4']);
    expect(draft('---\n---\nCuerpo')).toMatchObject({ frontmatter: 'applied', contentMarkdown: 'Cuerpo', title: 'past-modals' });
    expect(draft('---\r\ntitle: CRLF\r\n...\r\nCuerpo')).toMatchObject({ title: 'CRLF', contentMarkdown: 'Cuerpo' });
  });

  it('enseña los campos desconocidos y separa los de una exportación anterior', () => {
    const value = draft('---\ntitle: T\nauthor: Ana\nnotebook_uid: "9c8de1e3-03e6-42ec-a098-ac0db92331d0"\ncreated_at: "2026-01-01"\ncolor: {a: b}\n---\n');
    expect(value.unknownFields).toEqual(['author', 'color']);
    expect(value.ignoredFields).toEqual(['notebook_uid', 'created_at']);
  });

  it('no usa __proto__ ni claves compuestas más que como campos desconocidos', () => {
    const value = draft('---\n__proto__: {polluted: yes}\n? [a, b]\n: 1\n---\n');
    expect(value.unknownFields).toEqual(['__proto__', '["a","b"]']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    ['sin cierre', '---\ntitle: T\nCuerpo', /no se cierra/u],
    ['YAML inválido', '---\ntitle: a\n  mal: sangrado\n---\nCuerpo', /no es YAML válido \(línea 2\)/u],
    ['corchete sin cerrar', '---\ntitle: [T\n---\nCuerpo', /no es YAML válido/u],
    ['clave repetida', '---\ntitle: A\ntitle: B\n---\nCuerpo', /no es YAML válido/u],
    ['alias', '---\nbase: &b hola\ntitle: *b\n---\nCuerpo', /alias/u],
    ['etiqueta propia', '---\ntitle: !js/function hola\n---\nCuerpo', /etiquetas YAML/u],
    ['etiqueta de la especificación', '---\ntitle: !!int 3\n---\nCuerpo', /etiquetas YAML/u],
    ['lista en vez de campos', '---\n- a\n- b\n---\nCuerpo', /clave: valor/u],
  ])('%s: no se descarta, se conserva como texto y se avisa', (_name, text, reason) => {
    const value = draft(text);
    expect(value.frontmatter).toBe('kept');
    expect(value.contentMarkdown).toBe(text);
    expect(value.tags).toEqual([]);
    expect(value.warnings[0]).toMatchObject({ code: 'FRONTMATTER_KEPT' });
    expect(value.warnings[0]?.message).toMatch(reason);
  });

  it('un frontmatter de más de 8 KiB tampoco se interpreta', () => {
    const text = `---\ntitle: ${'x'.repeat(NOTEBOOK_LIMITS.frontmatterBytes)}\n---\nCuerpo`;
    const value = draft(text);
    expect(value).toMatchObject({ frontmatter: 'kept', contentMarkdown: text });
    expect(value.warnings[0]?.message).toMatch(/8 KiB/u);
  });

  it('no confunde una regla horizontal posterior con el frontmatter', () => {
    expect(draft('Intro\n\n---\n\ntitle: no\n')).toMatchObject({ frontmatter: 'none', title: 'past-modals' });
  });
});

describe('etiquetas', () => {
  it('descarta las no válidas, unifica las repetidas y conserva doce', () => {
    const many = Array.from({ length: 14 }, (_, index) => `t${String(index)}`);
    const value = draft(`---\ntags: [${['A', 'a', 'x'.repeat(41), ...many].join(', ')}, {k: v}]\n---\n`);
    expect(value.tags).toEqual(['a', ...many.slice(0, 11)]);
    expect(codes(value)).toEqual(['TAGS_INVALID', 'TAGS_DUPLICATED', 'TAGS_TRUNCATED']);
    expect(value.warnings[0]?.message).toMatch(/2 etiquetas no válidas/u);
  });

  it('un mapa en tags se descarta entero', () => {
    const value = draft('---\ntags: {nivel: c1}\n---\n');
    expect(value.tags).toEqual([]);
    expect(codes(value)).toEqual(['TAGS_INVALID']);
  });
});

describe('título', () => {
  it('prefiere el frontmatter, luego el primer H1 y por último el archivo', () => {
    expect(draft('## Sub\n\n# Primer H1 *con* formato\n')).toMatchObject({ title: 'Primer H1 con formato', titleSource: 'heading' });
    expect(draft('---\ntitle: "  "\n---\n# Del H1\n')).toMatchObject({ title: 'Del H1', titleSource: 'heading' });
    expect(draft('## Sin H1\n', 'notas  de\tclase.md')).toMatchObject({ title: 'notas de clase', titleSource: 'file' });
    expect(draft('', '.md')).toMatchObject({ title: 'Apunte importado', titleSource: 'file' });
  });

  it('avisa si title no es texto y recorta los títulos largos', () => {
    const invalid = draft('---\ntitle: [a, b]\n---\n# H1\n');
    expect(invalid).toMatchObject({ title: 'H1', titleSource: 'heading' });
    expect(codes(invalid)).toEqual(['TITLE_INVALID']);

    const long = draft(`---\ntitle: ${'é'.repeat(NOTEBOOK_LIMITS.title + 5)}\n---\n`);
    expect(Array.from(long.title)).toHaveLength(NOTEBOOK_LIMITS.title);
    expect(codes(long)).toEqual(['TITLE_TRUNCATED']);
  });

  it('limpia saltos y controles de un título de varias líneas', () => {
    expect(draft('---\ntitle: |\n  Dos\n  líneas\u0007\n---\n').title).toBe('Dos líneas');
  });
});

describe('avisos del contenido', () => {
  it('cuenta HTML, imágenes y destinos que no se pueden resolver', () => {
    const value = draft([
      '# Modales', '', '## Must have', '',
      '<div>html</div>', '', '<!-- nota -->', '',
      '![esquema](https://example.com/a.png) ![b][ref]', '',
      '[mal](javascript:alert(1)) [datos](data:text/html,x)', '',
      '[otro](./otro.md) [id ajeno](/notebook/42-modales)', '',
      '[bien](#nb-must-have) [github](#must-have) [externo](https://example.com)', '',
      '[ref]: https://example.com/b.png',
    ].join('\n'));
    expect(value.warnings.map((warning) => warning.message)).toEqual([
      'Contiene 2 fragmentos HTML o comentarios: se guardan, pero el lector no los muestra.',
      'Contiene 2 imágenes: se conservan como texto y no se cargan.',
      '2 enlaces usan un destino no admitido: se muestran como texto.',
      '2 enlaces apuntan a otros archivos o apuntes: se conservan, pero sus destinos no se importan con este archivo.',
      '1 ancla no coincide con ningún apartado de este apunte (aquí los apartados usan #nb-…).',
    ]);
    // El cuerpo no se reescribe para arreglar los enlaces.
    expect(value.contentMarkdown).toContain('[github](#must-have)');
  });

  it('un apunte sin nada de eso no genera avisos', () => {
    expect(draft('# Limpio\n\n[externo](https://example.com) [local](#nb-limpio)\n').warnings).toEqual([]);
  });
});
