import { expect, it } from 'vitest';
import { categoryOf } from './categories';
import { CATEGORIES } from '../domain/enums';

it.each([
  ['phrasal_verb', 'PHRASAL_VERB'], ['collocation', 'COLOCACION'], ['verb_noun', 'COLOCACION'], ['adverb_adjective', 'COLOCACION'],
  ['noun_preposition', 'PREPOSICION_DEPENDIENTE'], ['confusable_pair', 'LEXICO'], ['fixed_expression', 'EXPRESION_FIJA'], ['sentence_frame', 'EXPRESION_FIJA'],
  ['discourse_marker', 'DISCURSO'], ['linking_phrase', 'DISCURSO'], ['grammar_chunk', 'ESTRUCTURA'], ['noun_phrase', 'LEXICO'], ['core_word', 'LEXICO'],
  ['noun', 'LEXICO'], ['verb', 'LEXICO'], ['adjective', 'LEXICO'], ['academic_english', 'REGISTRO'], ['spoken_english', 'REGISTRO'], ['workplace_english', 'REGISTRO'],
  ['natural_production', null], ['invented', null],
])('mapea cat::%s a %s', (tag, expected) => { expect(categoryOf([`cat::${tag}`])).toBe(expected); });
it('elige una sola categoría independientemente del orden de tags', () => {
  expect(categoryOf(['cat::workplace_english', 'cat::natural_production', 'cat::PHRASAL_VERB'])).toBe('PHRASAL_VERB');
  expect(categoryOf(['cat::core_word', 'cat::collocation'])).toBe('COLOCACION');
  expect(categoryOf([])).toBeNull();
});
it.each(CATEGORIES)('conserva la categoría explícita de la app: %s', (category) => {
  expect(categoryOf(['cat::phrasal_verb', `errorlog::category::${category}`])).toBe(category);
});
