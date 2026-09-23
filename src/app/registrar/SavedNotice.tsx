'use client';

import { useEffect, useRef } from 'react';

import styles from './page.module.css';
import ui from '../_shared/ui.module.css';

export function SavedNotice({ message, sessionId }: { readonly message: string; readonly sessionId: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // El aviso ya esta pintado: se quita de la URL para que recargar no lo repita. Solo si
    // seguimos en esta sesion con el aviso puesto: nunca se reescribe la URL de otra vista.
    const url = new URL(window.location.href);
    if (url.pathname !== '/registrar' || url.searchParams.get('s') !== String(sessionId)) return;
    if (!url.searchParams.has('aviso')) return;
    url.searchParams.delete('aviso');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [sessionId]);
  return <p ref={ref} tabIndex={-1} role="status" className={`${ui.noticeOk} ${styles.savedNotice}`}>{message}</p>;
}
