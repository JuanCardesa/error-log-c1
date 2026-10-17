'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { LOCALE_COOKIE, isLocale } from '@/lib/i18n';

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * Guarda el idioma de la interfaz en este navegador. Fijar la cookie vuelve a pintar la
 * página actual en la misma respuesta; revalidar el layout hace lo mismo con las vistas
 * que el navegador guardaba para volver atrás.
 */
export async function setLocaleAction(locale: unknown): Promise<{ readonly ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: ONE_YEAR_S, sameSite: 'lax' });
  revalidatePath('/', 'layout');
  return { ok: true };
}
