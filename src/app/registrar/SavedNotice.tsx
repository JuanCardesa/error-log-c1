'use client';

import { useEffect, useRef } from 'react';

import styles from './page.module.css';
import ui from '../_shared/ui.module.css';

export function SavedNotice({ message, sessionId }: { readonly message: string; readonly sessionId: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // El aviso ya esta pintado: se quita de la URL para que recargar no lo repita.
    window.history.replaceState(null, '', `/registrar?s=${String(sessionId)}`);
  }, [sessionId]);
  return <p ref={ref} tabIndex={-1} role="status" className={`${ui.noticeOk} ${styles.savedNotice}`}>{message}</p>;
}
