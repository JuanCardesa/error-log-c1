'use client';

import { Ellipsis } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DeletionImpact } from '@/lib/db/repo';
import type { SessionRow } from '@/lib/domain/types';
import { ConfirmDialog } from '../_shared/ConfirmDialog';
import { Drawer } from '../_shared/Drawer';
import { sessionTitle } from '../_shared/format';
import { KIND_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../_shared/labels';
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
  const title = sessionTitle(session);

  const consequences = [
    `la sesión y ${impact.errors === 1 ? '1 error' : `${String(impact.errors)} errores`}`,
    ...(impact.hasWritingPiece ? ['su registro de Writing'] : []),
    ...(impact.rewrites > 0 ? [impact.rewrites === 1 ? 'el vínculo con su reescritura' : `el vínculo con sus ${String(impact.rewrites)} reescrituras`] : []),
  ];
  const consequenceText = consequences.length === 1
    ? consequences[0]
    : `${consequences.slice(0, -1).join(', ')} y ${consequences[consequences.length - 1] ?? ''}`;

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
              toast({ message: 'No se pudo confirmar el cambio. Recarga la sesión para ver su estado.', tone: 'error' });
            }
          });
        }}
      >
        {closed ? 'Reabrir para añadir' : 'Cerrar sesión'}
      </button>

      <Menu
        label="Más acciones de la sesión"
        trigger={(props) => (
          <button type="button" {...props} className={`${ui.iconButton} ${ui.iconBordered} ${ui.iconLarge}`} aria-label="Más acciones de la sesión">
            <Ellipsis size={18} aria-hidden="true" />
          </button>
        )}
      >
        {(close) => (
          <>
            <button type="button" role="menuitem" className={overlay.menuItem} onClick={() => { close(); setEditing(true); }}>
              Editar sesión
            </button>
            <button type="button" role="menuitem" className={overlay.menuItem} onClick={() => { close(); setShowData(true); }}>
              Datos de la sesión
            </button>
            <div className={overlay.menuSep} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={`${overlay.menuItem} ${overlay.menuItemDanger}`}
              onClick={() => { close(); setDeleteError(null); setConfirming(true); }}
            >
              Borrar sesión…
            </button>
          </>
        )}
      </Menu>

      <SessionDrawer open={editing} onClose={() => { setEditing(false); }} today={today} editing={session} />

      <Drawer open={showData} onClose={() => { setShowData(false); }} title="Datos de la sesión">
        <dl className={styles.dataList}>
          <dt>Identificador</dt><dd className="data">#{session.id}</dd>
          <dt>Fecha</dt><dd className="data">{session.date}</dd>
          <dt>Tipo</dt><dd>{KIND_LABELS[session.kind]}</dd>
          <dt>Fuente</dt><dd>{SOURCE_LABELS[session.source]}</dd>
          <dt>Referencia</dt><dd>{session.sourceRef ?? '—'}</dd>
          <dt>Ítems</dt><dd className="data">{session.itemsTotal === null ? 'no aplica' : `${String(session.itemsCorrect ?? 0)} / ${String(session.itemsTotal)}`}</dd>
          <dt>Duración</dt><dd className="data">{session.durationMin === null ? '—' : `${String(session.durationMin)} min`}</dd>
          <dt>Cronometrada</dt><dd>{session.timed ? 'Sí' : 'No'}</dd>
          <dt>Estado</dt><dd>{STATUS_LABELS[session.status]}</dd>
        </dl>
      </Drawer>

      <ConfirmDialog
        open={confirming}
        title={`Borrar «${title}»`}
        confirmLabel="Borrar sesión"
        pending={deleting}
        error={deleteError}
        aside={`${impact.converted > 0 ? 'Las notas que ya estén en Anki se conservan. ' : ''}No se puede deshacer.`}
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
              setDeleteError('No se pudo confirmar el borrado. Consulta Sesiones antes de repetirlo.');
            }
          });
        }}
      >
        <p>Se eliminarán {consequenceText}.</p>
      </ConfirmDialog>
    </div>
  );
}
