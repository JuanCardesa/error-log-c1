'use client';

import Link from 'next/link';

import ui from './_shared/ui.module.css';
import styles from './status.module.css';

/**
 * Un fallo inesperado al leer una vista. Se dice qué pasó y se ofrece reintentar; los
 * datos guardados no se tocan.
 */
export default function RouteError({ reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <div className={styles.status} role="alert">
      <h1 className={ui.pageTitle}>No se pudo cargar esta vista</h1>
      <p>Ha fallado la lectura de los datos. Lo guardado no se ha tocado; vuelve a intentarlo.</p>
      <div className={ui.row}>
        <button type="button" className={ui.primary} onClick={reset}>Reintentar</button>
        <Link href="/registrar" className={ui.ghost}>Ir a Sesiones</Link>
      </div>
    </div>
  );
}
