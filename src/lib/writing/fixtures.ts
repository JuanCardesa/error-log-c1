/**
 * El ejemplo del contrato (docs/WRITING-PLAN.md §6) para las pruebas: un essay corregido
 * con un párrafo flojo, puntuaciones con medio punto y anotaciones de todos los alcances.
 * Cada llamada devuelve una copia nueva que se puede modificar.
 */

export const ESSAY_TEXT = [
  'In recent years, many cities have tried to become more liveable. In my opinion, two measures deserve particular attention: investing in public transport and creating more green spaces.',
  'Firstly, an efficient public transport network has a direct impact on people\'s daily lives. It reduces traffic congestion and, as a result, cuts air pollution considerably.',
  'Secondly, green spaces are also important, but there effect is more limited. Many people dont use parks regularly, specially in winter, and the goverment have to spend a lot of money to mantain them, so a lot of residents prefer to stay at home.',
  'To conclude, although both measures are valuable, I believe public transport should be the priority, since it benefits a far larger number of citizens.',
].join('\n\n');

type Json = Record<string, unknown>;

export function essayImport(): Json & { writing: Json; assessment: Json; annotations: Json[] } {
  const span = (quote: string, paragraph: number, extra: Json = {}) => ({ scope: 'SPAN', quote, paragraph, ...extra });
  return {
    format: 'error-log-writing',
    version: 1,
    writing: {
      id: null,
      title: 'Making cities more liveable',
      type: 'ESSAY',
      writtenOn: '2026-10-02',
      taskPrompt: 'Write an essay discussing two of the measures in your notes.',
      text: ESSAY_TEXT,
      wordRange: null,
      timed: true,
      minutes: 80,
    },
    assessment: {
      status: 'CORRECTED',
      assessedBy: 'PROFESOR',
      correctedOn: '2026-10-09',
      scores: { content: 4, communicativeAchievement: 3, organisation: 3, language: 2.5 },
      total: 12.5,
      teacherComment: 'Paragraphs 1, 2 and 4 are well written. Paragraph 3 has a lot of basic grammar and spelling mistakes.',
      personalNotes: null,
    },
    annotations: [
      { kind: 'STRENGTH', focus: null, source: 'PROFESOR', target: { scope: 'PARAGRAPH', paragraph: 1 }, comment: 'Well written.', suggestion: null },
      { kind: 'ERROR', focus: null, source: 'PROFESOR', target: { scope: 'PARAGRAPH', paragraph: 3 }, comment: 'Needs work.', suggestion: null },
      { kind: 'ERROR', focus: 'SPELLING', source: 'PROFESOR', target: span('there', 3), comment: 'Possessive.', suggestion: 'their' },
      { kind: 'ERROR', focus: 'PUNCTUATION', source: 'PROFESOR', target: span('dont', 3), comment: null, suggestion: 'don\'t' },
      { kind: 'ERROR', focus: 'GRAMMAR', source: 'PROFESOR', target: span('have to', 3), comment: '\'The government\' takes a singular verb.', suggestion: 'has to' },
      { kind: 'IMPROVEMENT', focus: 'VOCABULARY', source: 'PROFESOR', target: span('a lot of', 3, { occurrence: 2 }), comment: 'More precise and formal.', suggestion: 'many' },
      { kind: 'STRENGTH', focus: 'LINKING', source: 'PROFESOR', target: span('as a result', 2), comment: 'Good linker.', suggestion: null },
      { kind: 'IMPROVEMENT', focus: 'CONTENT', source: 'IA', target: { scope: 'DOCUMENT' }, comment: 'State your position in the introduction.', suggestion: null },
    ],
  };
}

/** La primera importación: el texto sin corregir. */
export function uncorrectedImport(): Json & { writing: Json } {
  const { format, version, writing } = essayImport();
  return { format, version, writing };
}
