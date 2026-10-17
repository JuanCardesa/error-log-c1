import { describe, expect, it } from 'vitest';

import { countWords, normalizeWritingText, paragraphsOf, textSimilarity } from './text';

describe('normalizeWritingText', () => {
  it('solo cambia los saltos de Windows y los blancos de los bordes', () => {
    const inside = 'Dear  Sir,\tI’m writing “because”…\n\nYours faithfully,';
    expect(normalizeWritingText(`\n  ${inside.replace(/\n/g, '\r\n')}  \r\n`)).toBe(inside);
  });
});

describe('paragraphsOf', () => {
  it('separa por líneas en blanco, aunque tengan espacios, y numera desde 1', () => {
    const text = 'One.\nStill one.\n\nTwo.\n  \n\n\nThree.';
    expect(paragraphsOf(text).map((p) => text.slice(p.start, p.end))).toEqual(['One.\nStill one.', 'Two.', 'Three.']);
    expect(paragraphsOf(text).map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('un texto vacío no tiene párrafos', () => {
    expect(paragraphsOf('')).toEqual([]);
  });
});

describe('countWords', () => {
  it('no parte palabras con apóstrofo, guion ni cifras con decimales', () => {
    expect(countWords('I don’t think it’s a well-known fact that 2.5 or 1,000 people agree.')).toBe(13);
  });

  it('cuenta encabezados, saludo y despedida, y no la puntuación suelta', () => {
    expect(countWords('Introduction\n\nDear Sir — I am writing.\n\nYours faithfully,')).toBe(8);
    expect(countWords(' - … ')).toBe(0);
  });

  it('cuenta letras de cualquier alfabeto', () => {
    expect(countWords('café naïve Übermensch')).toBe(3);
  });
});

describe('textSimilarity', () => {
  it('casi 1 para dos transcripciones del mismo papel y bajo para otro texto', () => {
    const a = 'Firstly, an efficient public transport network has a direct impact on people’s daily lives.';
    const b = 'Firstly an efficient public transport network has a direct impact on peoples daily lives.';
    expect(textSimilarity(a, a)).toBe(1);
    expect(textSimilarity(a, b)).toBeGreaterThan(0.8);
    expect(textSimilarity(a, 'Dear Sir, I am writing to complain about the hotel.')).toBeLessThan(0.2);
    expect(textSimilarity('', '')).toBe(1);
  });
});
