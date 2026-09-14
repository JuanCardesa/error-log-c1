import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { FIXED_WINDOW_DAYS } from '@/lib/domain/thresholds';
import { q4FalseCertainties } from '@/lib/queries/q4FalseCertainties';
import shared from '../_shared/report.module.css';
import styles from './certezas.module.css';

/**
 * Q4 · Falsas certezas.
 *
 * No se agregan: se listan una a una, porque cada una es una creencia falsa instalada
 * y hay que verla escrita. Tienen prioridad sobre cualquier categoria.
 *
 * Sin conmutador de ventana: esta vista va siempre a 30 dias (decision P2).
 */

export const dynamic = 'force-dynamic';

export default async function CertezasPage() {
  const rows = q4FalseCertainties(loadDataset(getDb()), { now: new Date() });

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Falsas certezas</h1>
          <p className={shared.lede}>
            Errores cometidos con <span className="data">SEGURO</span> en los ultimos{' '}
            {FIXED_WINDOW_DAYS} dias. No son lagunas: son cosas que crees saber y no
            sabes, y por eso van antes que cualquier categoria.
          </p>
        </div>
        <span className={styles.count}>{rows.length}</span>
      </header>

      {rows.length === 0 ? (
        <p className={shared.empty}>
          Ninguna en los ultimos {FIXED_WINDOW_DAYS} dias. Es la mejor noticia que puede
          dar esta vista.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.errorId} className={styles.item}>
              <div className={styles.meta}>
                <span className="data">{row.date}</span>
                <span className="data">{row.cause}</span>
                <span className="data">{row.category}</span>
                {row.subcategory !== null && (
                  <span className="data">· {row.subcategory}</span>
                )}
              </div>

              <p className={styles.pair}>
                {row.myAnswer !== null && <span className={styles.wrong}>{row.myAnswer}</span>}
                {row.myAnswer !== null && ' → '}
                <strong>{row.correctAnswer}</strong>
              </p>

              <p className={styles.rule}>{row.ruleNote}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
