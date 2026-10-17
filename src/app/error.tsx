'use client';

import Link from 'next/link';

import { useT } from './_shared/i18nClient';
import ui from './_shared/ui.module.css';
import styles from './status.module.css';

/**
 * Un fallo inesperado al leer una vista. Se dice qué pasó y se ofrece reintentar; los
 * datos guardados no se tocan.
 */
export default function RouteError({ reset }: { readonly error: Error; readonly reset: () => void }) {
  const t = useT();
  return (
    <div className={styles.status} role="alert">
      <h1 className={ui.pageTitle}>{t.status.errorTitle}</h1>
      <p>{t.status.errorBody}</p>
      <div className={ui.row}>
        <button type="button" className={ui.primary} onClick={reset}>{t.common.retry}</button>
        <Link href="/registrar" className={ui.ghost}>{t.common.goToSessions}</Link>
      </div>
    </div>
  );
}
