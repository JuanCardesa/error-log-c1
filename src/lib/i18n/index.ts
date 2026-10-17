import { en } from './en';
import { es } from './es';

/**
 * Idioma de la interfaz: inglés por defecto y español a elección (Ajustes → Idioma).
 *
 * Solo se traduce lo que escribe la app. Lo que guarda o importa la persona —apuntes,
 * enunciados, respuestas, reglas— y los valores internos (enums, JSON, CSV, tarjetas de
 * Anki) no pasan nunca por aquí.
 *
 * Cada texto vive en `en.ts` y `es.ts`. Los que llevan datos son funciones, con tipos: así
 * el plural y el orden de las palabras los decide cada idioma, sin plantillas que analizar.
 */

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Independiente del idioma del navegador: sin preferencia guardada, inglés. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie con la preferencia. El servidor la lee para pintar ya en el idioma elegido. */
export const LOCALE_COOKIE = 'errorlog-locale';

export type Messages = typeof en;

/**
 * Un texto que se escribe al leerlo, con el diccionario de quien lo lee. Lo usan las capas
 * que no conocen el idioma de la petición (validación, Anki): devuelven o lanzan esto y
 * quien lo enseña lo redacta.
 */
export type LazyText = (t: Messages) => string;

type Leaf = string | readonly string[] | ((...args: never[]) => string);

/** Una traducción puede dejar huecos: lo que falte se toma del inglés. */
export type PartialMessages<T> = {
  readonly [K in keyof T]?: T[K] extends Leaf ? T[K] : PartialMessages<T[K]>;
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function isGroup(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Completa `override` con `base` clave a clave. */
export function withFallback<T extends object>(base: T, override: PartialMessages<T> | undefined): T {
  if (override === undefined) return base;
  const own = override as Readonly<Record<string, unknown>>;
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    merged[key] = isGroup(value)
      ? withFallback(value, own[key] as PartialMessages<typeof value> | undefined)
      : own[key] ?? value;
  }
  return merged as T;
}

const DICTIONARIES: Readonly<Record<Locale, Messages>> = {
  en,
  es: withFallback(en, es),
};

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
