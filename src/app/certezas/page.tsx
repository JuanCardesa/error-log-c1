import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { FIXED_WINDOW_DAYS } from '@/lib/domain/thresholds';
import { q4FalseCertainties } from '@/lib/queries/q4FalseCertainties';
import shared from '../_shared/report.module.css';
import ui from '../_shared/ui.module.css';
import { CATEGORY_LABELS, CAUSE_LABELS } from '../_shared/labels';
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
  const data = loadDataset(getDb());
  const rows = q4FalseCertainties(data, { now: new Date() });
  // La consulta no trae la sesion; las filas ya cargadas si. Sirve para ir a corregirla.
  const sessionOf = new Map(data.errors.map((error) => [error.id, error.sessionId]));

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Falsas certezas</h1>
          <p className={shared.lede}>
            Errores cometidos con confianza «Seguro» en los últimos {FIXED_WINDOW_DAYS}{' '}
            días. No son lagunas: son cosas que crees saber y no sabes, y por eso van antes
            que cualquier categoría.
          </p>
        </div>
        <p className={styles.count}>
          <span className="data">{rows.length}</span>{' '}
          {rows.length === 1 ? 'falsa certeza' : 'falsas certezas'}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className={ui.empty}>
          Ninguna en los últimos {FIXED_WINDOW_DAYS} días. Es la mejor noticia que puede
          dar esta vista.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.errorId} className={styles.item}>
              <div className={styles.meta}>
                <Link className="data" href={`/registrar?s=${String(sessionOf.get(row.errorId) ?? '')}`}>
                  {row.date}
                  <span className="sr-only"> · abrir su sesión</span>
                </Link>
                <span>{CAUSE_LABELS[row.cause]}</span>
                <span>{CATEGORY_LABELS[row.category]}</span>
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
