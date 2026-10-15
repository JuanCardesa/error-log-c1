'use client';

import type { SessionStatus } from '@/lib/domain/enums';
import { useT } from './i18nClient';
import ui from './ui.module.css';

/** Abierta (rombo) o Cerrada (cuadrado): forma y texto, no solo color. No es un botón. */
export function StatusText({ status, className }: {
  readonly status: SessionStatus;
  readonly className?: string;
}) {
  const t = useT();
  const tone = status === 'OPEN' ? ui.statusOpen : ui.statusClosed;
  return (
    <span className={`${ui.status} ${tone} ${className ?? ''}`}>
      <span className={ui.statusShape} aria-hidden="true" />
      {t.labels.status[status]}
    </span>
  );
}
