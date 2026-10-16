import type { WritingCriterion } from '@/lib/domain/enums';

/**
 * Los cuatro criterios de Cambridge con su nombre oficial, el mismo en los dos idiomas: es
 * el de la hoja de corrección y el del examen, como «Part 5».
 */
export const CRITERION_LABEL: Readonly<Record<WritingCriterion, string>> = {
  CONTENT: 'Content',
  COMMUNICATIVE: 'Communicative Achievement',
  ORGANISATION: 'Organisation',
  LANGUAGE: 'Language',
};

/** Las cuatro bandas, por separado: lo útil es justo lo que una media esconde. */
export const BANDS = [
  { name: 'bandContent', criterion: 'CONTENT', label: CRITERION_LABEL.CONTENT, short: 'Content' },
  { name: 'bandCommunicative', criterion: 'COMMUNICATIVE', label: CRITERION_LABEL.COMMUNICATIVE, short: 'Comm.' },
  { name: 'bandOrganisation', criterion: 'ORGANISATION', label: CRITERION_LABEL.ORGANISATION, short: 'Org.' },
  { name: 'bandLanguage', criterion: 'LANGUAGE', label: CRITERION_LABEL.LANGUAGE, short: 'Lang.' },
] as const;
