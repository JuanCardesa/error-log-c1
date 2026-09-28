import Link from 'next/link';

import ui from './_shared/ui.module.css';
import styles from './status.module.css';

export default function NotFound() {
  return (
    <div className={styles.status}>
      <h1 className={ui.pageTitle}>Esta página no existe</h1>
      <p>Puede que el enlace esté incompleto. Tus sesiones y errores siguen donde estaban.</p>
      <Link href="/registrar" className={ui.secondary}>Ir a Sesiones</Link>
    </div>
  );
}
