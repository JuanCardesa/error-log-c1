'use client';

import { useEffect, useRef } from 'react';

import { useToast } from '../_shared/Toast';

/**
 * Aviso de lo que se acaba de guardar al llegar a la sesión (`?aviso=`). Se enseña como
 * aviso y se quita de la URL para que recargar no lo repita. Solo si seguimos en esta
 * sesión con el aviso puesto: nunca se reescribe la URL de otra vista.
 */
export function SavedNotice({ message, sessionId }: { readonly message: string; readonly sessionId: number }) {
  const toast = useToast();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (shown.current !== message) {
      shown.current = message;
      toast({ message });
    }
    const url = new URL(window.location.href);
    if (url.pathname !== '/registrar' || url.searchParams.get('s') !== String(sessionId)) return;
    if (!url.searchParams.has('aviso')) return;
    url.searchParams.delete('aviso');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [message, sessionId, toast]);

  return null;
}
