import ui from '../_shared/ui.module.css';
import styles from './anki.module.css';

/**
 * Mientras responde AnkiConnect (hasta unos segundos si Anki está cerrado). Esqueleto con
 * la forma de la cola, sin brillo animado.
 */
export default function AnkiLoading() {
  return (
    <div className={styles.page} aria-busy="true">
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1 className={ui.pageTitle}>Anki</h1>
          <span className={ui.help} role="status">Consultando Anki…</span>
        </div>
      </div>
      <p className={styles.lead}>Consultando Anki… la cola local estará disponible en un momento.</p>
      <div className={styles.queueLayout} aria-hidden="true">
        <div className={styles.table}>
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
