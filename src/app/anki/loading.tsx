'use client';

import { useT } from '../_shared/i18nClient';
import { PageHeader } from '../_shared/PageHeader';
import ui from '../_shared/ui.module.css';
import styles from './anki.module.css';

/**
 * Mientras responde AnkiConnect (hasta unos segundos si Anki está cerrado). Esqueleto con
 * la forma de la cola, sin brillo animado.
 */
export default function AnkiLoading() {
  const t = useT();
  return (
    <div className={styles.page} aria-busy="true">
      <div className={styles.head}>
        <PageHeader title="Anki" actions={<span className={ui.help} role="status">{t.anki.checking}</span>} />
      </div>
      <p className={styles.lead}>{t.anki.checkingLead}</p>
      <div className={styles.queueLayout} aria-hidden="true">
        <div className={styles.skeletonTable}>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <span className={ui.skeleton} style={{ width: 44 }} />
              <span className={ui.skeleton} style={{ width: '70%' }} />
              <span className={ui.skeleton} style={{ width: '50%' }} />
            </div>
          ))}
        </div>
        <div className={styles.skeletonPanel}>
          <span className={ui.skeleton} style={{ width: '60%' }} />
          <span className={ui.skeleton} style={{ height: 16, width: '90%' }} />
          <span className={ui.skeleton} style={{ height: 16, width: '70%' }} />
          <span className={ui.skeleton} style={{ height: 48, width: '100%' }} />
          <span className={ui.skeleton} style={{ height: 40, width: 150, alignSelf: 'flex-end' }} />
        </div>
      </div>
    </div>
  );
}
