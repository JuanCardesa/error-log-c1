'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { BackLink } from '../_shared/BackLink';
import { useT } from '../_shared/i18nClient';

/**
 * Volver al historial con la misma búsqueda, filtros y página con los que se salió. El
 * historial apunta su URL en la pestaña; entrar directo a una sesión vuelve a la lista
 * sin filtros.
 */

const KEY = 'errorlog:sesiones';

function read(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const subscribe = () => () => undefined;

export function RememberList() {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, `${window.location.pathname}${window.location.search}`);
    } catch {
      // Sin almacenamiento, el regreso va a la lista sin filtros.
    }
  });
  return null;
}

export function useListHref(): string {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  return stored !== null && stored.startsWith('/registrar') && !stored.includes('s=') ? stored : '/registrar';
}

export function BackToList() {
  const t = useT();
  const href = useListHref();
  const kept = href !== '/registrar';
  return <BackLink href={href} label={t.nav.sessions} hint={kept ? t.sessionView.filterKept : undefined} />;
}
