'use client';

import { CircleCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { useImportHost } from './ImportHost';
import styles from './sessions.module.css';

/**
 * El cierre de una tanda guardada: qué se guardó, qué deja pendiente en Anki y lo
 * siguiente. Llega de dos sitios: `?aviso=` al crear una sesión desde la lista, o la
 * revisión que acaba de guardarse en esta sesión abierta.
 *
 * La región viva está siempre montada y el contenido entra un fotograma después: así se
 * anuncia también al llegar navegando, y no solo al cambiar.
 */
export function BatchDone({ notice, sessionId, pendingCards }: {
  readonly notice: string | null;
  readonly sessionId: number;
  readonly pendingCards: number;
}) {
  const t = useT();
  const host = useImportHost();
  // La revisión guardada aquí manda sobre el aviso con el que se llegó.
  const message = host.lastSaved?.message ?? notice;
  const round = host.lastSaved?.round ?? 0;
  const fromList = host.lastSaved === null;
  const [shown, setShown] = useState<{ readonly message: string; readonly round: number } | null>(null);
  const [closed, setClosed] = useState<number | null>(null);

  useEffect(() => {
    if (message === null) return;
    const frame = requestAnimationFrame(() => { setShown({ message, round }); });
    return () => { cancelAnimationFrame(frame); };
  }, [message, round]);

  // Recargar no repite el cierre. Solo si seguimos en esta sesión con el aviso puesto.
  useEffect(() => {
    if (notice === null) return;
    const url = new URL(window.location.href);
    if (url.pathname !== '/registrar' || url.searchParams.get('s') !== String(sessionId)) return;
    if (!url.searchParams.has('aviso')) return;
    url.searchParams.delete('aviso');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [notice, sessionId]);

  const visible = shown !== null && closed !== shown.round ? shown : null;

  return (
    <div role="status" className={styles.doneRegion}>
      {visible !== null && (
        <section key={visible.round} className={styles.done} aria-label={t.sessions.doneLabel}>
          <CircleCheck size={22} className={styles.doneIcon} aria-hidden="true" />
          <div className={styles.doneText}>
            <strong className={styles.doneTitle}>{visible.message}</strong>
            <span className={styles.doneCards}>
              {pendingCards > 0 ? t.sessions.donePendingCards(pendingCards) : t.sessions.doneNoCards}
            </span>
          </div>
          <div className={styles.doneActions}>
            {pendingCards > 0 && <Link href="/anki" className={`${ui.secondary} ${ui.compact}`}>{t.sessions.doneToAnki}</Link>}
            {fromList && <Link href="/registrar#pegar" className={`${ui.ghost} ${ui.compact}`}>{t.sessions.donePasteAnother}</Link>}
            <button
              type="button"
              className={ui.iconButton}
              aria-label={t.common.closeNotice}
              onClick={() => { setClosed(visible.round); }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
