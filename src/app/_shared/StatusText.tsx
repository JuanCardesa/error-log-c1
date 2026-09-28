import type { SessionStatus } from '@/lib/domain/enums';
import { STATUS_LABELS } from './labels';
import ui from './ui.module.css';

/** Abierta (rombo) o Cerrada (cuadrado): forma y texto, no solo color. No es un botón. */
export function StatusText({ status, className }: {
  readonly status: SessionStatus;
  readonly className?: string;
}) {
  const tone = status === 'OPEN' ? ui.statusOpen : ui.statusClosed;
  return (
    <span className={`${ui.status} ${tone} ${className ?? ''}`}>
      <span className={ui.statusShape} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
