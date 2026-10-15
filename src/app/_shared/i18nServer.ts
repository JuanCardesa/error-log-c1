import { cookies } from 'next/headers';

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, type Messages, getMessages, isLocale } from '@/lib/i18n';

/**
 * Idioma de la petición, para páginas, acciones y rutas del servidor. Sale de la cookie
 * de Ajustes; sin ella, o con un valor desconocido, inglés.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<Messages> {
  return getMessages(await getLocale());
}
