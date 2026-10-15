'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { DEFAULT_LOCALE, type Locale, type Messages, getMessages } from '@/lib/i18n';

/**
 * Idioma en los componentes de cliente. El layout lo lee de la cookie y lo pasa aquí:
 * al cambiarlo en Ajustes, el servidor vuelve a pintar el layout y todo el árbol cambia
 * a la vez, sin recargar la página.
 */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { readonly locale: Locale; readonly children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Messages {
  return getMessages(useLocale());
}
