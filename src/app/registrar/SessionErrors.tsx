'use client';

import { ClipboardPaste, Plus } from 'lucide-react';
import { useState } from 'react';

import type { SessionRow } from '@/lib/domain/types';
import { ErrorExplorer, type ExplorerRow } from '../_shared/errors/ErrorExplorer';
import { useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import capture from './capture.module.css';
import { CaptureForm } from './CaptureForm';
import { useImportHost } from './ImportHost';
import { PasteEntry, StoredDraftNotice } from './PasteEntry';
import styles from './sessions.module.css';

/**
 * Los errores de una sesión: lista con detalle al lado y, si está abierta, captura uno a
 * uno o pegado de varios. Entrar a consultar no abre ningún formulario; «Continuar»
 * (`modo=captura`) sí.
 */
export function SessionErrors({ session, rows, subcategorySuggestions, lastCategory, initialMode, initialErrorId }: {
  readonly session: SessionRow;
  readonly rows: readonly ExplorerRow[];
  readonly subcategorySuggestions: readonly string[];
  readonly lastCategory: string | null;
  readonly initialMode: 'capture' | null;
  readonly initialErrorId: number | null;
}) {
  const t = useT();
  const open = session.status === 'OPEN';
  const [mode, setMode] = useState<'capture' | 'paste' | null>(open ? initialMode : null);
  const active = open ? mode : null;
  // Una vez abierta, la captura se queda montada: cambiar a pegar no se lleva lo escrito.
  const [captureMounted, setCaptureMounted] = useState(active === 'capture');
  if (active === 'capture' && !captureMounted) setCaptureMounted(true);
  // Guardada una tanda pegada, su texto ya no existe: el pegado se cierra.
  const { savedRounds } = useImportHost();
  const [seenRounds, setSeenRounds] = useState(savedRounds);
  if (savedRounds !== seenRounds) {
    setSeenRounds(savedRounds);
    if (mode === 'paste') setMode(null);
  }

  return (
    <section className={styles.errorsSection} aria-labelledby="errors-heading">
      {open && <StoredDraftNotice />}
      <div className={styles.errorsHead}>
        <h2 id="errors-heading" className={ui.sectionTitle}>
          {t.nav.errors} <span className={ui.sectionCount}>· {rows.length}</span>
        </h2>
        <span className={ui.spacer} />
        {open && (
          <>
            <button type="button" className={ui.secondary} aria-expanded={active === 'paste'} onClick={() => { setMode(active === 'paste' ? null : 'paste'); }}>
              <ClipboardPaste size={16} aria-hidden="true" />
              {t.sessionView.pasteMany}
            </button>
            <button type="button" className={ui.primary} aria-expanded={active === 'capture'} onClick={() => { setMode(active === 'capture' ? null : 'capture'); }}>
              <Plus size={16} aria-hidden="true" />
              {t.errorForm.addError}
            </button>
          </>
        )}
      </div>

      {active === 'paste' && (
        <div className={`${ui.surface} ${capture.block}`}>
          <h3 className={capture.blockTitle}>{t.sessionView.pasteIntoSession}</h3>
          <PasteEntry variant="session" onCancel={() => { setMode(null); }} />
        </div>
      )}

      {open && captureMounted && (
        <CaptureForm
          visible={active === 'capture'}
          session={session}
          subcategorySuggestions={subcategorySuggestions}
          lastCategory={lastCategory}
          onClose={() => { setMode(null); }}
        />
      )}

      <ErrorExplorer
        rows={rows}
        mode="session"
        initialSelectedId={initialErrorId}
        subcategorySuggestions={subcategorySuggestions}
        caption={t.sessionView.errorsCaption}
        empty={(
          <p className={styles.noErrors}>
            {session.itemsTotal === null
              ? t.sessionView.noErrors
              : t.sessionView.noErrorsScore(session.itemsCorrect ?? 0, session.itemsTotal)}
          </p>
        )}
      />
    </section>
  );
}
