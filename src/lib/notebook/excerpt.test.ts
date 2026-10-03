import { describe, expect, it } from 'vitest';

import { notebookFixtureMarkdown } from '../db/notebookFixtures';
import { findNotebookMarkdownExcerpt } from './markdown';

/**
 * El fragmento de un resultado se puede sacar de un trozo del apunte (TASK 7.2), pero solo
 * si sale idéntico al del documento entero: mismo texto, misma posición del acierto y el
 * mismo apartado, con su slug. Aquí se compara el camino corto contra el completo con
 * cortes en muchas posiciones, sobre los casos donde un corte podría cambiar el árbol.
 */

const WHOLE = { wholeBelow: Number.POSITIVE_INFINITY };
const MARGINS = [0, 1, 2, 5, 10, 20, 40, 80, 160, 320];

function expectSameAsWhole(markdown: string, query: string, margins: readonly number[] = MARGINS) {
  const whole = findNotebookMarkdownExcerpt(markdown, query, WHOLE);
  for (const margin of margins) {
    expect(findNotebookMarkdownExcerpt(markdown, query, { wholeBelow: 0, margin }), `margen ${String(margin)}`)
      .toEqual(whole);
  }
  return whole;
}

const filler = (label: string) => `${label} sigue con una explicación larga para que el contexto no quepa entero en el fragmento del resultado.`;

describe('fragmento a partir de un trozo del apunte', () => {
  it('un bloque de código con líneas en blanco no se confunde con el texto de después', () => {
    const markdown = [
      filler('Primero'), '', '```', 'const a = 1;', '', 'must have dentro del código', '', '```', '',
      '## Después', '', `Aquí must have fuera del código. ${filler('Luego')}`, '', filler('Final'),
    ].join('\n');
    expect(expectSameAsWhole(markdown, 'must have')?.heading).toBeNull();
    expect(expectSameAsWhole(markdown, 'fuera del codigo')?.heading?.slug).toBe('nb-después');
  });

  it('un comentario HTML que cruza líneas en blanco no aporta texto ni corta nada', () => {
    const markdown = [
      filler('Antes'), '', '<!--', 'must have escondido', '', 'sigue el comentario', '-->', '',
      `Visible: must have aquí. ${filler('Resto')}`, '', filler('Cierre'),
    ].join('\n');
    expectSameAsWhole(markdown, 'must have');
  });

  it('respeta encabezados setext, tablas, citas con encabezado y listas holgadas', () => {
    const markdown = [
      'Título setext', '=============', '', filler('Intro'), '',
      '| Forma | Uso |', '| --- | --- |', '| must have | deducción segura |', '| might have | posibilidad abierta |', '',
      '> ## Regla en una cita', '>', `> ${filler('Cita')}`, '',
      '- primer punto', '', '  con continuación y inversion dentro', '', '- segundo punto', '',
      '      código indentado', '', '      más código con inversion', '', filler('Fin'), '', filler('Más'),
    ].join('\n');
    expectSameAsWhole(markdown, 'deduccion segura');
    expectSameAsWhole(markdown, 'inversion');
    expect(expectSameAsWhole(markdown, 'cita sigue')?.heading?.slug).toBe('nb-regla-en-una-cita');
  });

  it('los encabezados repetidos conservan el sufijo del slug', () => {
    const markdown = ['## Must have', '', filler('Uno'), '', '## Must have', '', `Segundo apartado con la clave. ${filler('Dos')}`, '', filler('Tres')].join('\n');
    expect(expectSameAsWhole(markdown, 'la clave')?.heading?.slug).toBe('nb-must-have-1');
  });

  it('una frase partida por el formato y los saltos CRLF dan lo mismo', () => {
    const markdown = [`Primero must **have** partido. ${filler('Uno')}`, '', `Luego must have entero. ${filler('Dos')}`, '', filler('Tres')].join('\r\n');
    expect(expectSameAsWhole(markdown, 'must have')?.text).toContain('must have partido');
  });

  it('cerca del final o sin acierto recurre al documento entero', () => {
    expect(expectSameAsWhole(`${filler('Inicio')}\n\nla clave al final`, 'clave al final')?.text).toMatch(/final$/u);
    expect(expectSameAsWhole(`${filler('Inicio')}\n\n${filler('Otro')}`, 'zzqx')).toBeNull();
  });

  it('con definiciones de enlace o de nota al pie siempre parsea entero', () => {
    const markdown = [`Ver [la regla][r] y la nota[^1]. ${filler('Uno')}`, '', filler('Dos'), '', '[r]: /notebook/1-regla', '[^1]: Una nota.'].join('\n');
    expectSameAsWhole(markdown, 'la regla');
  });

  it('coincide con el documento entero en los apuntes largos del cuaderno de prueba', () => {
    const long: string[] = [];
    for (let index = 0; long.length < 4; index += 1) {
      const markdown = notebookFixtureMarkdown(index);
      if (markdown.length > 8 * 1024) long.push(markdown);
    }
    for (const markdown of long) {
      for (const query of ['must have', 'deducción', 'la regla se aplica']) {
        expectSameAsWhole(markdown, query, [0, 300]);
      }
    }
  });
});
