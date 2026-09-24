import Link from 'next/link';

import { DEFAULT_WINDOW_DAYS, WINDOW_DAYS_OPTIONS } from '@/lib/domain/thresholds';
import ui from './ui.module.css';

/**
 * Conmutador 30/60 días. Son enlaces: cambiar la ventana cambia lo que se mira, y eso
 * merece una URL propia. Conserva los demás parámetros de la vista (`keep`), para que
 * cambiar el periodo no cierre una pestaña ni un filtro.
 *
 * Q4 y la regla 2 no lo obedecen: van siempre a 30 días (decisión P2).
 */
export function WindowSwitch({
  current,
  basePath,
  keep = {},
  label = 'Periodo',
}: {
  readonly current: number;
  readonly basePath: string;
  readonly keep?: Readonly<Record<string, string | undefined>>;
  readonly label?: string;
}) {
  const href = (days: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep)) {
      if (value !== undefined && value !== '') params.set(key, value);
    }
    if (days !== DEFAULT_WINDOW_DAYS) params.set('w', String(days));
    const query = params.toString();
    return query === '' ? basePath : `${basePath}?${query}`;
  };

  return (
    <nav className={ui.segmented} aria-label={label}>
      {WINDOW_DAYS_OPTIONS.map((days) => (
        <Link
          key={days}
          href={href(days)}
          className={ui.segment}
          aria-current={days === current ? 'true' : undefined}
          scroll={false}
        >
          {days} días
        </Link>
      ))}
    </nav>
  );
}
