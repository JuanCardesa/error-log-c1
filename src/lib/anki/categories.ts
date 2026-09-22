import { CATEGORIES, type Category } from '../domain/enums';

const PRIORITY: readonly [Category, readonly string[]][] = [
  ['PHRASAL_VERB', ['phrasal_verb']],
  ['COLOCACION', ['collocation', 'verb_noun', 'adverb_adjective']],
  ['PREPOSICION_DEPENDIENTE', ['noun_preposition']],
  ['LEXICO', ['confusable_pair']],
  ['EXPRESION_FIJA', ['fixed_expression', 'sentence_frame']],
  ['DISCURSO', ['discourse_marker', 'linking_phrase']],
  ['ESTRUCTURA', ['grammar_chunk']],
  ['LEXICO', ['noun_phrase', 'core_word', 'noun', 'verb', 'adjective']],
  ['REGISTRO', ['academic_english', 'spoken_english', 'workplace_english']],
];

export function categoryOf(tags: readonly string[]): Category | null {
  // Las notas de la app llevan su taxonomía explícita, sin reinterpretar el error.
  const explicit = CATEGORIES.find((category) => tags.includes(`errorlog::category::${category}`));
  if (explicit !== undefined) return explicit;
  const names = new Set(tags.map((tag) => tag.toLowerCase()));
  for (const [category, aliases] of PRIORITY) {
    if (aliases.some((alias) => names.has(`cat::${alias}`))) return category;
  }
  return null;
}
