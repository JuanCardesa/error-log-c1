import Link from 'next/link';

import { WINDOW_DAYS_OPTIONS } from '@/lib/domain/thresholds';
import styles from './report.module.css';

/**
 * Conmutador 30/60 dias. Son enlaces, no botones: cambiar la ventana cambia lo que
 * mira el informe, y eso merece una URL propia.
 *
 * Q4 y la regla 2 no lo obedecen: van siempre a 30 dias (decision P2).
 */
export function WindowSwitch({
  current,
  basePath,
}: {
  readonly current: number;
  readonly basePath: string;
}) {
  return (
    <div className={styles.windowSwitch} role="group" aria-label="Ventana de analisis">
      {WINDOW_DAYS_OPTIONS.map((days) => (
        <Link
          key={days}
          href={days === 30 ? basePath : `${basePath}?w=${String(days)}`}
          className={days === current ? styles.windowOn : styles.windowOff}
          aria-current={days === current ? 'true' : undefined}
        >
          {days} d
        </Link>
      ))}
    </div>
  );
}
