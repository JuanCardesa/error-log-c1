'use client';

import { Ellipsis } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DeletionImpact } from '@/lib/db/repo';
import type { SessionRow } from '@/lib/domain/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { Drawer } from '../_shared/Drawer';
import { sessionTitle } from '../_shared/format';
import { useT } from '../_shared/i18nClient';
import { Menu } from '../_shared/Menu';
import { useToast } from '../_shared/Toast';
import overlay from '../_shared/overlay.module.css';
import ui from '../_shared/ui.module.css';
import { deleteSessionAction, setSessionStatusAction } from './actions';
import { useListHref } from './BackToList';
import { SessionDrawer } from './SessionForm';
import styles from './sessions.module.css';

/**
 * Acciones de una sesión: cerrar o reabrir (reversible, directo) y, en el menú, editar,
 * ver sus datos y borrarla. Borrar pide confirmación y nombra todo lo que arrastra.
 */
export function SessionControls({ session, impact, today }: {
  readonly session: SessionRow;
  readonly impact: DeletionImpact;
  readonly today: string;
}) {
  const t = useT();
  const router = useRouter();
  const backHref = useListHref();
  const toast = useToast();
  const [statusPending, startStatus] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [editing, setEditing] = useState(false);
  const [showData, setShowData] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closed = session.status === 'CLOSED';
  const title = sessionTitle(session, t);

  return (
    <div className={styles.headActions}>
      <button
        type="button"
        className={ui.secondary}
        disabled={statusPending}
        aria-busy={statusPending}
        onClick={() => {
          startStatus(async () => {
            try {
              const result = await setSessionStatusAction(session.id, closed ? 'OPEN' : 'CLOSED');
              toast({ message: result.message, tone: result.ok ? 'ok' : 'error' });
            } catch {
              toast({ message: t.sessionView.statusUncertain, tone: 'error' });
            }
          });
        }}
      >
        {closed ? t.sessionView.reopen : t.sessionView.closeSession}
      </button>

      <Menu
        label={t.sessionView.moreActions}
        trigger={(props) => (
          <button type="button" {...props} className={`${ui.iconButton} ${ui.iconBordered} ${ui.iconLarge}`} aria-label={t.sessionView.moreActions}>
            <Ellipsis size={18} aria-hidden="true" />
          </button>
        )}
      >
        {(close) => (
          <>
            <button type="button" role="menuitem" className={overlay.menuItem} onClick={() => { close(); setEditing(true); }}>
              {t.sessionView.editSession}
            </button>
            <button type="button" role="menuitem" className={overlay.menuItem} onClick={() => { close(); setShowData(true); }}>
              {t.sessionView.sessionData}
            </button>
            <div className={overlay.menuSep} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={`${overlay.menuItem} ${overlay.menuItemDanger}`}
              onClick={() => { close(); setDeleteError(null); setConfirming(true); }}
            >
              {t.sessionView.deleteSessionMenu}
            </button>
          </>
        )}
      </Menu>

      <SessionDrawer open={editing} onClose={() => { setEditing(false); }} today={today} editing={session} />

      <Drawer open={showData} onClose={() => { setShowData(false); }} title={t.sessionView.sessionData}>
        <dl className={styles.dataList}>
          <dt>{t.sessionView.id}</dt><dd className="data">#{session.id}</dd>
          <dt>{t.sessionForm.date}</dt><dd className="data">{session.date}</dd>
          <dt>{t.sessionForm.kind}</dt><dd>{t.labels.kind[session.kind]}</dd>
          <dt>{t.sessionForm.source}</dt><dd>{t.labels.source[session.source]}</dd>
          <dt>{t.sessionForm.reference}</dt><dd>{session.sourceRef ?? '—'}</dd>
          <dt>{t.sessionView.items}</dt><dd className="data">{session.itemsTotal === null ? t.sessionView.notApplicable : `${String(session.itemsCorrect ?? 0)} / ${String(session.itemsTotal)}`}</dd>
          <dt>{t.sessionView.duration}</dt><dd className="data">{session.durationMin === null ? '—' : `${String(session.durationMin)} min`}</dd>
          <dt>{t.sessionForm.timed}</dt><dd>{session.timed ? t.common.yes : t.common.no}</dd>
          <dt>{t.sessionView.status}</dt><dd>{t.labels.status[session.status]}</dd>
        </dl>
      </Drawer>

      <ConfirmDialog
        open={confirming}
        title={t.sessionView.deleteTitle(title)}
        confirmLabel={t.sessionView.deleteSession}
        pending={deleting}
        error={deleteError}
        aside={`${impact.converted > 0 ? t.sessionView.ankiNotesKept : ''}${t.common.cannotUndo}`}
        onCancel={() => { setConfirming(false); }}
        onConfirm={() => {
          startDelete(async () => {
            try {
              const result = await deleteSessionAction(session.id);
              if (!result.ok) {
                setDeleteError(result.message);
                return;
              }
              setConfirming(false);
              toast({ message: result.message });
              router.push(backHref);
            } catch {
              setDeleteError(t.sessionView.deleteUncertain);
            }
          });
        }}
      >
        <p>{t.sessionView.deleteWillRemove(impact.errors, impact.hasWritingPiece, impact.rewrites)}</p>
      </ConfirmDialog>
    </div>
  );
}
