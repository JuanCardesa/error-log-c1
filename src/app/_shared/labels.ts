import type { Category } from '@/lib/domain/enums';

/**
 * Etiquetas de interfaz para los valores de las taxonomias.
 *
 * Solo cambian lo que se lee en pantalla: el `value` de cada control, lo que se guarda y
 * lo que se exporta siguen siendo el enum tal cual (SPEC §3).
 */

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  COLOCACION: 'Colocación',
  PHRASAL_VERB: 'Phrasal verb',
  WORD_FORMATION: 'Word formation',
  PREPOSICION_DEPENDIENTE: 'Preposición dependiente',
  TIEMPO_VERBAL: 'Tiempo verbal',
  ESTRUCTURA: 'Estructura',
  ARTICULO_CUANTIFICADOR: 'Artículo o cuantificador',
  LEXICO: 'Léxico',
  EXPRESION_FIJA: 'Expresión fija',
  DISCURSO: 'Discurso',
  COMPRENSION: 'Comprensión',
  REGISTRO: 'Registro',
  ESTRUCTURA_TEXTO: 'Estructura del texto',
  SPELLING: 'Spelling',
};
