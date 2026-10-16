'use client';

import { Ellipsis, PanelRight } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Menu } from '../_shared/Menu';
import overlay from '../_shared/overlay.module.css';
import ui from '../_shared/ui.module.css';
import { WritingEditor } from './PieceForm';
import { useReader } from './ReaderContext';
import styles from './writing.module.css';

/**
 * Barra del lector: el panel de anotaciones a la vista y todo lo que edita en «Más
 * acciones». Sin transcripción no hay nada que anotar y queda el botón de siempre.
 */
export function ReaderActions({ count, exportHref, editor, labels }: {
  readonly count: number;
  readonly exportHref: string | null;
  readonly editor: Omit<ComponentProps<typeof WritingEditor>, 'trigger'>;
  readonly labels: {
    readonly annotations: string;
    readonly annotationsCount: string;
    readonly moreActions: string;
    readonly editDetails: string;
    readonly correctTranscription: string;
    readonly annotateText: string;
    readonly exportJson: string;
  };
}) {
  const { panelOpen, setPanelOpen, mode, setMode } = useReader();
  if (exportHref === null) return <WritingEditor {...editor} />;

  return (
    <div className={styles.readerActions}>
      {mode !== 'transcribe' && (
        <button type="button" className={`${ui.secondary} ${ui.compact} ${styles.panelToggle}`}
          aria-expanded={panelOpen} aria-controls="writing-annotations" aria-label={labels.annotationsCount}
          onClick={() => setPanelOpen(!panelOpen)}>
          <PanelRight size={16} aria-hidden="true" />
          <span className={styles.panelToggleText}>{labels.annotations}</span>
          <span className={styles.panelToggleCount}>{count}</span>
        </button>
      )}
      <WritingEditor {...editor} trigger={(openEditor) => (
        <Menu label={labels.moreActions} trigger={(props) => (
          <button type="button" {...props} className={`${ui.iconButton} ${ui.iconBordered}`} aria-label={labels.moreActions}>
            <Ellipsis size={18} aria-hidden="true" />
          </button>
        )}>
          {(close) => (
            <>
              <button type="button" role="menuitem" className={overlay.menuItem}
                onClick={() => { close(); setMode('annotate'); setPanelOpen(true); }}>{labels.annotateText}</button>
              <button type="button" role="menuitem" className={overlay.menuItem}
                onClick={() => { close(); setMode('transcribe'); setPanelOpen(false); }}>{labels.correctTranscription}</button>
              <button type="button" role="menuitem" className={overlay.menuItem}
                onClick={() => { close(); openEditor(); }}>{labels.editDetails}</button>
              <div className={overlay.menuSep} role="separator" />
              <a role="menuitem" className={overlay.menuItem} href={exportHref} download onClick={close}>{labels.exportJson}</a>
            </>
          )}
        </Menu>
      )} />
    </div>
  );
}
