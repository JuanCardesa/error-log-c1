import { describe, expect, it } from 'vitest';

import { ESSAY_TEXT } from './fixtures';
import { locateQuote, type QuoteTarget } from './locate';

const target = (quote: string, extra: Partial<QuoteTarget> = {}): QuoteTarget => ({
  quote, paragraph: null, occurrence: null, before: null, after: null, start: null, end: null, ...extra,
});

function found(text: string, location: ReturnType<typeof locateQuote>): string | null {
  return location.status === 'placed' ? text.slice(location.start, location.end) : null;
}

describe('locateQuote', () => {
  it('coloca una cita que aparece una sola vez', () => {
    const location = locateQuote(ESSAY_TEXT, target('goverment'));
    expect(location).toMatchObject({ status: 'placed', loose: false });
    expect(found(ESSAY_TEXT, location)).toBe('goverment');
  });

  it('no elige entre apariciones repetidas: las deja para elegir a mano', () => {
    const location = locateQuote(ESSAY_TEXT, target('public transport'));
    expect(location).toMatchObject({ status: 'ambiguous', reason: 'several' });
    expect(location.status === 'ambiguous' && location.candidates).toHaveLength(3);
  });

  it('el párrafo y el número de aparición deshacen la repetición', () => {
    const first = locateQuote(ESSAY_TEXT, target('a lot of', { paragraph: 3, occurrence: 1 }));
    const second = locateQuote(ESSAY_TEXT, target('a lot of', { paragraph: 3, occurrence: 2 }));
    expect(found(ESSAY_TEXT, first)).toBe('a lot of');
    expect(second.status === 'placed' && ESSAY_TEXT.slice(second.end, second.end + 10)).toBe(' residents');
    expect(locateQuote(ESSAY_TEXT, target('public transport', { paragraph: 2 }))).toMatchObject({ status: 'placed' });
  });

  it('también el contexto de antes o de después', () => {
    const location = locateQuote(ESSAY_TEXT, target('a lot of', { after: 'residents' }));
    expect(location.status === 'placed' && ESSAY_TEXT.slice(location.end, location.end + 10)).toBe(' residents');
    const before = locateQuote(ESSAY_TEXT, target('public transport', { before: 'investing  in' }));
    expect(before.status === 'placed' && ESSAY_TEXT.slice(before.start - 13, before.start)).toBe('investing in ');
  });

  it('no coloca si la aparición o el contexto contradicen lo encontrado', () => {
    expect(locateQuote(ESSAY_TEXT, target('goverment', { occurrence: 2 }))).toMatchObject({ status: 'ambiguous', reason: 'contradicts' });
    expect(locateQuote(ESSAY_TEXT, target('goverment', { before: 'the council' }))).toMatchObject({ status: 'ambiguous', reason: 'contradicts' });
    expect(locateQuote(ESSAY_TEXT, target('a lot of', { paragraph: 3, occurrence: 3 }))).toMatchObject({ status: 'ambiguous', reason: 'contradicts' });
  });

  it('una cita no empieza ni acaba a mitad de palabra', () => {
    // «there» no está dentro de otra palabra; «it» solo como palabra suelta, no en «cities».
    expect(locateQuote('The city and its cities: it works.', target('it'))).toMatchObject({ status: 'placed', start: 25 });
    expect(locateQuote('Citizens of the city.', target('it'))).toEqual({ status: 'notFound' });
  });

  it('tolera blancos, comillas tipográficas, guiones y mayúsculas, y lo dice', () => {
    const text = 'It’s  a well‐known “fact”.';
    const location = locateQuote(text, target('it\'s a well-known "fact"'));
    expect(location).toMatchObject({ status: 'placed', loose: true });
    expect(found(text, location)).toBe('It’s  a well‐known “fact”');
  });

  it('usa las posiciones de una exportación solo si siguen señalando la cita', () => {
    const start = ESSAY_TEXT.indexOf('public transport', 300);
    const exported = target('public transport', { start, end: start + 'public transport'.length });
    expect(locateQuote(ESSAY_TEXT, exported)).toMatchObject({ status: 'placed', start, loose: false });
    expect(locateQuote(ESSAY_TEXT, { ...exported, start: 0, end: 16 })).toMatchObject({ status: 'ambiguous' });
  });

  it('dice que no la encuentra, también en un párrafo que no existe', () => {
    expect(locateQuote(ESSAY_TEXT, target('bicycle lanes'))).toEqual({ status: 'notFound' });
    expect(locateQuote(ESSAY_TEXT, target('goverment', { paragraph: 9 }))).toEqual({ status: 'notFound' });
    expect(locateQuote(ESSAY_TEXT, target('goverment', { paragraph: 1 }))).toEqual({ status: 'notFound' });
  });
});
