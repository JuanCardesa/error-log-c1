import styles from './correction.module.css';

/**
 * «Tu respuesta → Corrección». La respuesta propia va tachada en rojo; si no se registró
 * se dice, en cursiva y sin tachar, en vez de un guion que parezca otra respuesta.
 *
 * - `inline`: una línea en monoespaciada, para filas de tabla.
 * - `detail`: dos filas etiquetadas en serif, para leer un caso.
 */
export function CorrectionPair({ mine, correct, variant = 'inline' }: {
  readonly mine: string | null;
  readonly correct: string;
  readonly variant?: 'inline' | 'detail';
}) {
  const hasMine = mine !== null && mine.trim() !== '';

  if (variant === 'detail') {
    return (
      <dl className={styles.detail}>
        <dt>Tu respuesta</dt>
        <dd className={hasMine ? styles.mineSerif : styles.missingSerif}>
          {hasMine ? mine : 'Mi respuesta no registrada'}
        </dd>
        <dt>Corrección</dt>
        <dd className={styles.correctSerif}>{correct}</dd>
      </dl>
    );
  }

  return (
    <span className={styles.inline}>
      {hasMine ? (
        <>
          <s className={styles.mine}>
            <span className="sr-only">Tu respuesta: </span>
            {mine}
          </s>
          <span className={styles.arrow} aria-hidden="true">→</span>
        </>
      ) : null}
      <span className={styles.correct}>
        <span className="sr-only">Corrección: </span>
        {correct}
      </span>
    </span>
  );
}
