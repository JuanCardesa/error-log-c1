import type { z } from 'zod';
import zodEn from 'zod/v4/locales/en.js';
import zodEs from 'zod/v4/locales/es.js';

import type { LazyText, Messages } from './index';

/**
 * Mensajes de validación en el idioma de quien lee.
 *
 * Un esquema que vive como constante no sabe en qué idioma se va a leer. En vez de un
 * texto fijo, sus `refine` llevan en `params` una función del diccionario (`localized`),
 * y quien valida pasa `zodErrors(t)`: Zod la consulta al terminar, ya con el idioma de la
 * petición. Lo que no lleva texto propio sale de los mensajes de Zod en ese idioma.
 *
 * Un mensaje fijado en el propio esquema sigue mandando: Zod lo prefiere a este mapa.
 */

export function localized(text: LazyText): { readonly params: { readonly text: LazyText } } {
  return { params: { text } };
}

// Solo los dos locales de la interfaz: `z.locales` arrastraría todos al navegador.
const builtIn = { en: zodEn().localeError, es: zodEs().localeError } as const;

export function zodErrors(t: Messages): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.code === 'custom') {
      const text: unknown = issue.params?.['text'];
      if (typeof text === 'function') return (text as LazyText)(t);
    }
    // Mismo umbral que `.min(1)`: un texto obligatorio que llega vacío.
    if (issue.code === 'too_small' && issue.origin === 'string' && Number(issue.minimum) === 1) return t.validation.empty;
    return builtIn[t.locale](issue);
  };
}

/**
 * Para formularios: un valor fuera de lista dice que se elija de la lista, en vez de
 * enumerar todas las opciones del enum.
 */
export function formErrors(t: Messages): z.core.$ZodErrorMap {
  const base = zodErrors(t);
  return (issue) => (issue.code === 'invalid_value' ? t.common.chooseOption : base(issue));
}
