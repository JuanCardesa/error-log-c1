import type { WritingStatus } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';
import ui from '../_shared/ui.module.css';

/** Pendiente (rombo de aviso) o corregida y sin entregar (cuadrado): forma y texto, no solo color. */
export function WritingStatusText({ status, t }: { readonly status: WritingStatus; readonly t: Messages }) {
  return (
    <span className={`${ui.status} ${status === 'AWAITING' ? ui.statusOpen : ui.statusClosed}`}>
      <span className={ui.statusShape} aria-hidden="true" />
      {t.labels.writingStatus[status]}
    </span>
  );
}
