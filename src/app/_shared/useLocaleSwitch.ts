'use client';

import { useOptimistic, useTransition } from 'react';

import type { Locale } from '@/lib/i18n';
import { useLocale, useT } from './i18nClient';
import { setLocaleAction } from './localeActions';
import { useToast } from './Toast';

/**
 * Cambia el idioma de la interfaz desde «Más» o desde ⌘K. La elección se marca al momento
 * y el resto de la app cambia cuando responde el servidor, sin recargar la página. Si falla,
 * lo dice un aviso.
 */
export function useLocaleSwitch(): { readonly shown: Locale; readonly choose: (next: Locale) => void } {
  const locale = useLocale();
  const t = useT();
  const toast = useToast();
  const [shown, setShown] = useOptimistic(locale);
  const [, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next);
      try {
        const result = await setLocaleAction(next);
        if (!result.ok) toast({ message: t.settings.saveFailed, tone: 'error' });
      } catch {
        toast({ message: t.settings.saveFailed, tone: 'error' });
      }
    });
  };

  return { shown, choose };
}
