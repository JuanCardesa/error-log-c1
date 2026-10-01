import { describe, expect, it } from 'vitest';
import { applyStudyCommand, isStudyHighlighted, resolveStudyAnchor, studyAnchor, studySegments, type NotebookAnnotation, type StudyCommand } from './annotations';
import { notebookStudyText } from './studyMarkdown';

const text = 'one two three four';
let serial = 0;
const apply = (marks: readonly NotebookAnnotation[], start: number, end: number, command: StudyCommand) =>
  applyStudyCommand(marks, text, { start, end }, command, 1, '2026-09-30', () => String(++serial));

describe('marcas de estudio', () => {
  it('mantiene rotulador y tinta independientes, y recorta solo el tramo seleccionado', () => {
    let marks = apply([], 0, text.length, { kind: 'highlight', enabled: true });
    marks = apply(marks, 4, 13, { kind: 'color', color: 'blue' });
    marks = apply(marks, 8, 13, { kind: 'color', color: 'red' });
    expect(studySegments(marks)).toEqual([
      { start: 0, end: 4, highlight: true, color: null },
      { start: 4, end: 8, highlight: true, color: 'blue' },
      { start: 8, end: 13, highlight: true, color: 'red' },
      { start: 13, end: 18, highlight: true, color: null },
    ]);
    marks = apply(marks, 4, 7, { kind: 'clear' });
    expect(isStudyHighlighted(marks, { start: 0, end: 4 })).toBe(true);
    expect(isStudyHighlighted(marks, { start: 0, end: 8 })).toBe(false);
    expect(marks.every((item) => item.anchor.end <= 4 || item.anchor.start >= 7)).toBe(true);
    expect(new Set(marks.map((item) => item.id)).size).toBe(marks.length);
  });

  it('quitar rotulador conserva el color y normal conserva el rotulador', () => {
    let marks = apply([], 0, 7, { kind: 'highlight', enabled: true });
    marks = apply(marks, 0, 7, { kind: 'color', color: 'green' });
    expect(apply(marks, 0, 7, { kind: 'highlight', enabled: false }).map((item) => item.kind)).toEqual(['color']);
    expect(apply(marks, 0, 7, { kind: 'color', color: null }).map((item) => item.kind)).toEqual(['highlight']);
  });

  it('resuelve texto único movido, pero no aproxima texto editado ni traslada una frase borrada a su repetición', () => {
    const original = 'first special phrase last';
    const anchor = studyAnchor(original, 6, 20);
    expect(resolveStudyAnchor(`inserted ${original}`, anchor, original)?.start).toBe(15);
    expect(resolveStudyAnchor('first modified phrase last', anchor, original)).toBeNull();
    const repeated = 'A concept here. B concept there.';
    const first = studyAnchor(repeated, 2, 9);
    expect(resolveStudyAnchor('B concept there.', first, repeated)).toBeNull();
    expect(resolveStudyAnchor(repeated, first, repeated)?.start).toBe(2);
    expect(resolveStudyAnchor('concept concept', studyAnchor('concept', 0, 7), 'concept')).toBeNull();
    const sameContext = `${'a'.repeat(60)}concept${'b'.repeat(60)}`;
    const duplicated = `${sameContext}\n${sameContext}`;
    expect(resolveStudyAnchor(sameContext, studyAnchor(duplicated, 60, 67), duplicated)).toBeNull();
  });

  it('comparte texto visible entre énfasis, entidades, listas, títulos y enlaces; excluye código', () => {
    const source = '# Título\n\nUno **dos** &amp; [tres](https://example.com).\n\n- Cuatro\n\n`cinco`\n\n```js\nseis\n```';
    const visible = notebookStudyText(source);
    expect(visible).toContain('Uno dos & tres.');
    expect(visible).toContain('Título\n');
    expect(visible).toContain('Cuatro\n');
    expect(visible).not.toMatch(/cinco|seis|example/);
    expect(visible).toContain('\uFFFC');
  });
});
