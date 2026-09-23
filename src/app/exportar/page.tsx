import { CSV_EXPORTS, CSV_LABELS } from '@/lib/export/dump';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import styles from './exportar.module.css';

/**
 * Exportar. Un CSV por consulta y un volcado completo en JSON.
 *
 * El JSON lleva las filas crudas ademas de los resultados: con las agregaciones solas
 * no se reconstruye nada. La recuperacion de la app usa una copia SQLite verificada.
 */

export default async function ExportarPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);
  const query = windowDays === 30 ? '' : `?w=${String(windowDays)}`;

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Exportar</h1>
          <p className={shared.lede}>
            Cada consulta en su CSV, listo para abrir en una hoja de calculo. La ventana
            activa es de {windowDays} dias.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/exportar" />
      </header>

      <ul className={styles.list}>
        {CSV_EXPORTS.map((key) => (
          <li key={key} className={styles.item}>
            <a className={styles.row} href={`/exportar/${key}.csv${query}`} download>
              <span>{CSV_LABELS[key]}</span>
              <span className={styles.file}>errorlog-{key}.csv</span>
            </a>
          </li>
        ))}
      </ul>

      <section className={styles.dump} aria-labelledby="dump-heading">
        <h2 id="dump-heading">Volcado completo</h2>
        <ul className={styles.list} style={{ marginTop: 'var(--sp-4)' }}>
          <li className={styles.item}>
            <a className={styles.row} href={`/exportar/dump.json${query}`} download>
              <span>Tus filas, el historial de Anki, las consultas y el informe de reglas</span>
              <span className={styles.file}>errorlog-dump.json</span>
            </a>
          </li>
        </ul>
        <p className={styles.note}>
          Las falsas certezas usan siempre 30 dias, porque su umbral esta calibrado a esa ventana.
          El JSON permite llevarte tus datos, pero no se puede restaurar desde esta pantalla.
          Para una copia recuperable, ejecuta <code>pnpm db:backup</code>.
          Las instrucciones para recuperarla estan en el README.
        </p>
      </section>
    </div>
  );
}
