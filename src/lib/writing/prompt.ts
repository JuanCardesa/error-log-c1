import { ANNOTATION_FOCUSES, ANNOTATION_KINDS, CORRECTORS, GENRES, WRITING_STATUSES } from '../domain/enums';
import type { Messages } from '../i18n';
import { WRITING_LIMITS } from './limits';

/**
 * Instrucciones para que ChatGPT o Claude preparen el JSON a partir de las fotos. Sin
 * dependencias de servidor: el botón que las copia vive en el navegador. Una prueba
 * comprueba que el ejemplo cumple el contrato, así que no puede quedarse atrás.
 */

const EXAMPLE = {
  format: 'error-log-writing',
  version: 1,
  writing: {
    id: null,
    title: 'Making cities more liveable',
    type: 'ESSAY',
    writtenOn: '2026-10-02',
    taskPrompt: null,
    text: 'In recent years, many cities have tried to become more liveable.\n\nGreen spaces are also important, but there effect is more limited.',
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
    teacherComment: 'Paragraph 2 has a lot of basic mistakes.',
    personalNotes: null,
  },
  annotations: [
    {
      kind: 'ERROR', focus: 'SPELLING', source: 'PROFESOR',
      target: { scope: 'SPAN', quote: 'there', paragraph: 2, occurrence: null },
      comment: 'Possessive.', suggestion: 'their',
    },
    {
      kind: 'STRENGTH', focus: null, source: 'PROFESOR',
      target: { scope: 'PARAGRAPH', paragraph: 1 },
      comment: 'Well written.', suggestion: null,
    },
    {
      kind: 'IMPROVEMENT', focus: 'CONTENT', source: 'IA',
      target: { scope: 'DOCUMENT' },
      comment: 'State your position in the introduction.', suggestion: null,
    },
  ],
} as const;

export const WRITING_PROMPT_EXAMPLE = JSON.stringify(EXAMPLE, null, 2);

export function writingPrompt(t: Messages): string {
  return t.writingImport.aiPrompt({
    example: WRITING_PROMPT_EXAMPLE,
    types: GENRES.join(', '),
    statuses: WRITING_STATUSES.join(', '),
    sources: CORRECTORS.join(', '),
    kinds: ANNOTATION_KINDS.join(', '),
    focuses: ANNOTATION_FOCUSES.join(', '),
    maxAnnotations: WRITING_LIMITS.annotations,
  });
}
