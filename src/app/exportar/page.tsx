import { ChevronRight, Download, FileArchive, FileBraces, FileSpreadsheet } from 'lucide-react';

import { CSV_EXPORTS, type CsvExport } from '@/lib/export/dump';
import { getT } from '../_shared/i18nServer';
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
  const t = await getT();
  const x = t.export;
  const windowDays = parseWindow(params['w']);
  const query = windowDays === 30 ? '' : `?w=${String(windowDays)}`;
  const ordered = [...CSV_EXPORTS].sort((a, b) => Number(FIXED.has(a)) - Number(FIXED.has(b)));

  return (
    <div className={styles.page}>
      <h1 className={ui.pageTitle}>{t.nav.exportData}</h1>

      <section className={styles.section} aria-labelledby="csv-heading">
        <div className={styles.sectionHead}>
          <h2 id="csv-heading" className={ui.sectionTitle}>{x.csvTitle}</h2>
          <WindowSwitch current={windowDays} basePath="/exportar" label={x.reportsPeriod} />
        </div>
        <ul className={styles.list}>
          {ordered.map((key) => (
            <li key={key} className={styles.row}>
              <span className={styles.name}>
                <FileSpreadsheet size={18} className={styles.icon} aria-hidden="true" />
                <span className={styles.nameText}>
                  <span className={styles.label}>{x.csv[key]}</span>
                  <span className={styles.file}>errorlog-{key}.csv</span>
                </span>
              </span>
              <span className={FIXED.has(key) ? styles.scopeFixed : styles.scope}>
                {FIXED.has(key) ? x.always30 : t.format.days(windowDays)}
              </span>
              <a className={`${ui.secondary} ${ui.compact} ${styles.download}`} href={`/exportar/${key}.csv${FIXED.has(key) ? '' : query}`} download aria-label={x.downloadLabel(x.csv[key])}>
                <Download size={16} aria-hidden="true" />
                {t.common.download}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="json-heading">
        <h2 id="json-heading" className={ui.sectionTitle}>{x.fullTitle}</h2>
        <ul className={styles.list}>
          <li className={styles.row}>
            <span className={styles.name}>
              <FileBraces size={18} className={styles.icon} aria-hidden="true" />
              <span className={styles.nameText}>
                <span className={styles.label}>{x.fullJson}</span>
                <span className={styles.file}>errorlog-dump.json</span>
              </span>
            </span>
            <span className={styles.scopeFixed}>{t.errors.wholeHistory}</span>
            <a className={`${ui.secondary} ${ui.compact} ${styles.download}`} href="/exportar/dump.json" download aria-label={x.downloadJson}>
              <Download size={16} aria-hidden="true" />
              {t.common.download}
            </a>
          </li>
        </ul>
        <p className={ui.help}>{x.fullHelp}</p>
      </section>

      <section className={styles.section} aria-labelledby="notebook-heading">
        <h2 id="notebook-heading" className={ui.sectionTitle}>{x.notebookTitle}</h2>
        <ul className={styles.list}>
          <li className={styles.row}>
            <span className={styles.name}>
              <FileArchive size={18} className={styles.icon} aria-hidden="true" />
              <span className={styles.nameText}>
                <span className={styles.label}>{x.notebookZip}</span>
                <span className={styles.file}>errorlog-notebook.zip</span>
              </span>
            </span>
            <span className={styles.scopeFixed}>{x.allNotes}</span>
            <a className={`${ui.secondary} ${ui.compact} ${styles.download}`} href="/exportar/notebook.zip" download aria-label={x.downloadZip}>
              <Download size={16} aria-hidden="true" />
              {t.common.download}
            </a>
          </li>
        </ul>
        <p className={ui.help}>
          {x.zipHelp1}<code className={styles.code}>.md</code>{x.zipHelp2}<code className={styles.code}>manifest.json</code>{x.zipHelp3}
        </p>
      </section>

      <details className={`${ui.disclosure} ${styles.backup}`}>
        <summary>
          <ChevronRight size={14} className="chevron" aria-hidden="true" />
          {x.backupTitle}
        </summary>
        <p className={ui.disclosureBody}>
          {x.backup1}<code className={styles.code}>pnpm db:backup</code>{x.backup2}<code className={styles.code}>pnpm db:restore</code>{x.backup3}
        </p>
      </details>
    </div>
  );
}
