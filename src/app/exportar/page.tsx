import { ChevronRight, Download, FileArchive, FileBraces, FileSpreadsheet, type LucideIcon } from 'lucide-react';

import { CSV_EXPORTS, type CsvExport } from '@/lib/export/dump';
import { getT } from '../_shared/i18nServer';
import { PageHeader } from '../_shared/PageHeader';
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
      <PageHeader title={t.nav.exportData} />

      <section className={styles.section} aria-labelledby="csv-heading">
        <div className={styles.sectionHead}>
          <h2 id="csv-heading" className={ui.sectionTitle}>{x.csvTitle}</h2>
          <WindowSwitch current={windowDays} basePath="/exportar" label={x.reportsPeriod} />
        </div>
        <ul className={styles.list}>
          {ordered.map((key) => (
            <DownloadRow
              key={key}
              icon={FileSpreadsheet}
              label={x.csv[key]}
              file={`errorlog-${key}.csv`}
              scope={FIXED.has(key) ? x.always30 : t.format.days(windowDays)}
              href={`/exportar/${key}.csv${FIXED.has(key) ? '' : query}`}
              name={x.downloadLabel(x.csv[key])}
              cue={t.common.download}
            />
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="json-heading">
        <h2 id="json-heading" className={ui.sectionTitle}>{x.fullTitle}</h2>
        <ul className={styles.list}>
          <DownloadRow
            icon={FileBraces}
            label={x.fullJson}
            file="errorlog-dump.json"
            scope={t.errors.wholeHistory}
            href="/exportar/dump.json"
            name={x.downloadJson}
            cue={t.common.download}
          />
        </ul>
        <p className={ui.help}>{x.fullHelp}</p>
      </section>

      <section className={styles.section} aria-labelledby="notebook-heading">
        <h2 id="notebook-heading" className={ui.sectionTitle}>{x.notebookTitle}</h2>
        <ul className={styles.list}>
          <DownloadRow
            icon={FileArchive}
            label={x.notebookZip}
            file="errorlog-notebook.zip"
            scope={x.allNotes}
            href="/exportar/notebook.zip"
            name={x.downloadZip}
            cue={t.common.download}
          />
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

/**
 * Una descarga: la fila entera es el enlace, como las categorías de Progreso. A la derecha,
 * «Descargar» en tinta secundaria anuncia qué pasa al pulsar sin repetir siete botones.
 */
function DownloadRow({ icon: Icon, label, file, scope, href, name, cue }: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly file: string;
  readonly scope: string;
  readonly href: string;
  /** Nombre accesible del enlace: «Descargar …». */
  readonly name: string;
  readonly cue: string;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.name}>
        <Icon size={18} className={styles.icon} aria-hidden="true" />
        <span className={styles.nameText}>
          <a className={styles.label} href={href} download aria-label={name}>{label}</a>
          <span className={styles.file}>{file}</span>
        </span>
      </span>
      <span className={styles.scope}>{scope}</span>
      <span className={styles.cue} aria-hidden="true">
        <Download size={16} />
        {cue}
      </span>
    </li>
  );
}
