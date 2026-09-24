import { ChevronRight, Download, FileBraces, FileSpreadsheet } from 'lucide-react';

import { CSV_EXPORTS, CSV_LABELS, type CsvExport } from '@/lib/export/dump';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import styles from './exportar.module.css';

/**
 * Exportar: cada descarga dice su alcance junto a ella. El periodo solo afecta a los
 * informes que lo obedecen; las falsas certezas van siempre a 30 días y el JSON lleva
 * todo el historial. El JSON sirve para portabilidad, no para restaurar.
 */

export const dynamic = 'force-dynamic';

/** Q4 no obedece la ventana (decisión P2). */
const FIXED: ReadonlySet<CsvExport> = new Set(['q4']);

export default async function ExportarPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);
  const query = windowDays === 30 ? '' : `?w=${String(windowDays)}`;
  const ordered = [...CSV_EXPORTS].sort((a, b) => Number(FIXED.has(a)) - Number(FIXED.has(b)));

  return (
    <div className={styles.page}>
      <h1 className={ui.pageTitle}>Exportar datos</h1>

      <section className={styles.section} aria-labelledby="csv-heading">
        <div className={styles.sectionHead}>
          <h2 id="csv-heading" className={ui.sectionTitle}>Informes CSV</h2>
          <WindowSwitch current={windowDays} basePath="/exportar" label="Periodo de los informes" />
        </div>
        <ul className={styles.list}>
          {ordered.map((key) => (
            <li key={key} className={styles.row}>
              <span className={styles.name}>
                <FileSpreadsheet size={18} className={styles.icon} aria-hidden="true" />
                <span className={styles.nameText}>
                  <span className={styles.label}>{CSV_LABELS[key]}</span>
                  <span className={styles.file}>errorlog-{key}.csv</span>
                </span>
              </span>
              <span className={FIXED.has(key) ? styles.scopeFixed : styles.scope}>
                {FIXED.has(key) ? 'Siempre 30 días' : `${String(windowDays)} días`}
              </span>
              <a className={`${ui.secondary} ${ui.compact} ${styles.download}`} href={`/exportar/${key}.csv${FIXED.has(key) ? '' : query}`} download aria-label={`Descargar ${CSV_LABELS[key]}`}>
                <Download size={16} aria-hidden="true" />
                Descargar
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="json-heading">
        <h2 id="json-heading" className={ui.sectionTitle}>Datos completos</h2>
        <ul className={styles.list}>
          <li className={styles.row}>
            <span className={styles.name}>
              <FileBraces size={18} className={styles.icon} aria-hidden="true" />
              <span className={styles.nameText}>
                <span className={styles.label}>Datos completos · JSON</span>
                <span className={styles.file}>errorlog-dump.json</span>
              </span>
            </span>
            <span className={styles.scopeFixed}>Todo el historial</span>
            <a className={`${ui.secondary} ${ui.compact} ${styles.download}`} href="/exportar/dump.json" download aria-label="Descargar datos completos en JSON">
              <Download size={16} aria-hidden="true" />
              Descargar
            </a>
          </li>
        </ul>
        <p className={ui.help}>Tus filas y el historial de Anki tal cual, sin cifras calculadas: esas salen de los CSV o de la propia app.</p>
      </section>

      <details className={`${ui.disclosure} ${styles.backup}`}>
        <summary>
          <ChevronRight size={14} className="chevron" aria-hidden="true" />
          Cómo crear una copia recuperable
        </summary>
        <p className={ui.disclosureBody}>
          El JSON sirve para portabilidad, no para restaurar. Para una copia restaurable de la base SQLite ejecuta{' '}
          <code className={styles.code}>pnpm db:backup</code>, y <code className={styles.code}>pnpm db:restore</code> para
          recuperarla. Las instrucciones completas están en el README.
        </p>
      </details>
    </div>
  );
}
