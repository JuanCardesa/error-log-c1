import { Upload } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { listWritingLibrary } from '@/lib/db/writingRepo';
import { REWRITE_REPEAT_PCT } from '@/lib/domain/thresholds';
import type { Messages } from '@/lib/i18n';
import { q6RewriteEfficacy } from '@/lib/queries/q6RewriteEfficacy';
import { countByStatus, searchLibrary, selectLibrary, type LibraryQuery } from '@/lib/writing/library';
import { parseProgressFilters } from '@/lib/writing/progress';
import { writingHref } from '@/lib/writing/urls';
import { decimal, mediumDate, percent, shortDate } from '../_shared/format';
import { getT } from '../_shared/i18nServer';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import { BANDS } from './bands';
import { libraryItems, type LibraryItem } from './entries';
import { isFiltered, parseLibraryQuery } from './libraryParams';
import { LibraryToolbar } from './LibraryToolbar';
import { ProgressView } from './ProgressView';
import { WritingStatusText } from './WritingStatusText';
import styles from './writing.module.css';

/**
 * Writing: la biblioteca de redacciones y la eficacia de las reescrituras (Q6). El periodo
 * solo afecta a Reescrituras: la biblioteca es siempre el historial entero.
 */

export const dynamic = 'force-dynamic';

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');
const ID = /^[1-9]\d*$/u;

export default async function WritingPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const w = t.writing;

  // Las altas entran por la importación; el regreso desde Sesiones trae su sesión libre.
  if (one(params['registrar']) === '1') {
    const sesion = one(params['sesion']);
    redirect(ID.test(sesion) ? `/writing/importar?sesion=${sesion}` : '/writing/importar');
  }

  const db = getDb();
  const items = libraryItems(listWritingLibrary(db), t);

  // Los enlaces de antes del lector (`?edit=<id>`) abren los datos de ese texto.
  const edit = one(params['edit']);
  const editing = ID.test(edit) ? items.find((item) => item.id === Number(edit)) : undefined;
  if (editing !== undefined) redirect(`${writingHref(editing.row.piece)}?editar=1`);

  const tab = one(params['tab']) === 'reescrituras' ? 'reescrituras'
    : one(params['tab']) === 'progreso' ? 'progreso' : 'biblioteca';
  const windowDays = parseWindow(params['w']);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1 className={ui.pageTitle}>{t.nav.writing}</h1>
          <Link href="/writing/importar" className={ui.primary}>
            <Upload size={16} aria-hidden="true" />
            {t.writingImport.title}
          </Link>
        </div>
        <RouteTabs
          label={w.views}
          items={[
            { href: '/writing', label: w.library, current: tab === 'biblioteca' },
            { href: '/writing?tab=progreso', label: w.progressTab, current: tab === 'progreso' },
            { href: `/writing?tab=reescrituras${windowDays === 30 ? '' : `&w=${String(windowDays)}`}`, label: w.rewrites, current: tab === 'reescrituras' },
          ]}
        />
      </div>

      {edit !== '' && <p className={ui.helpWarn} role="status">{w.notFound}</p>}

      {tab === 'biblioteca' ? (
        <Library items={items} query={parseLibraryQuery(params)} t={t} />
      ) : tab === 'progreso' ? (
        <ProgressView items={items} filters={parseProgressFilters(params)} t={t} />
      ) : (
        <Rewrites windowDays={windowDays} items={items} t={t} />
      )}
    </div>
  );
}

function Library({ items, query, t }: {
  readonly items: readonly LibraryItem[];
  readonly query: LibraryQuery;
  readonly t: Messages;
}) {
  const w = t.writing;
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{w.empty}</p>
        <Link href="/writing/importar" className={ui.textLink}>{t.writingImport.title}</Link>
      </div>
    );
  }
  const shown = selectLibrary(items, query);
  return (
    <section className={styles.library} aria-label={w.library}>
      <LibraryToolbar query={query} counts={countByStatus(searchLibrary(items, query))} />
      {shown.length === 0 ? (
        <div className={styles.empty}>
          <p>{w.noMatch}</p>
          {isFiltered(query) && <Link href="/writing" className={ui.textLink}>{t.common.clearFilters}</Link>}
        </div>
      ) : (
        <ul className={styles.entries} aria-label={w.listLabel(shown.length)}>
          {shown.map((item) => <Entry key={item.id} item={item} t={t} />)}
        </ul>
      )}
    </section>
  );
}

function Entry({ item, t }: { readonly item: LibraryItem; readonly t: Messages }) {
  const w = t.writing;
  const { piece, pending } = item.row;
  const details = [
    t.labels.genre[piece.genre],
    mediumDate(piece.date, t),
    ...(piece.wordCount === null ? [] : [w.words(piece.wordCount)]),
    ...(piece.originalText === null ? [w.noTranscription] : []),
    ...(pending > 0 ? [w.toReview(pending)] : []),
    ...(piece.rewriteOf === null ? [] : [w.rewrite]),
  ];
  return (
    <li className={styles.entry}>
      <div className={styles.entryMain}>
        <Link href={writingHref(piece)} className={styles.entryTitle}>{item.title}</Link>
        <p className={styles.entryMeta}>
          {details.map((detail) => <span key={detail}>{detail}</span>)}
          {piece.status !== 'CORRECTED' && <span><WritingStatusText status={piece.status} t={t} /></span>}
        </p>
      </div>
      <span className={styles.entryScore}>
        {item.total === null
          ? <><span aria-hidden="true">—</span><span className="sr-only">{w.noScore}</span></>
          : w.score(decimal(item.total, t))}
      </span>
    </li>
  );
}

function bandValue(value: number | null, t: Messages) {
  return value === null
    ? <span className={styles.unrated}>{t.writing.unrated}</span>
    : <span className="num">{decimal(value, t)}</span>;
}

function Rewrites({ windowDays, items, t }: {
  readonly windowDays: number;
  readonly items: readonly LibraryItem[];
  readonly t: Messages;
}) {
  const q6 = q6RewriteEfficacy(loadDataset(getDb()), { now: new Date(), windowDays });
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <div className={styles.rewrites}>
      <div className={styles.rewritesHead}>
        <p className={ui.help}>
          {q6.pairs.length === 0
            ? t.writing.noPairs(windowDays)
            : q6.pctRepeated === null
              ? t.writing.noOriginalErrors
              : t.writing.repeatSummary(q6.totalRepeated, q6.totalOriginalErrors, percent(q6.pctRepeated, t), percent(REWRITE_REPEAT_PCT, t))}
        </p>
        <WindowSwitch current={windowDays} basePath="/writing" keep={{ tab: 'reescrituras' }} label={t.writing.rewritesPeriod} />
      </div>
      {q6.pairs.map((pair) => {
        const original = byId.get(pair.originalId);
        const rewrite = byId.get(pair.rewriteId);
        if (original === undefined || rewrite === undefined) return null;
        return (
          <section key={pair.rewriteId} className={styles.pair} aria-label={t.writing.pairLabel(original.title)}>
            <h2 className={styles.pairTitle}>{t.writing.pairTitle(original.title)}</h2>
            <table className={styles.compare}>
              <caption className="sr-only">{t.writing.compareCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.writing.band}</th>
                  <th scope="col" className={styles.center}>{t.writing.originalCol(shortDate(original.date, t))}</th>
                  <th scope="col" className={styles.center}>{t.writing.newCol(shortDate(rewrite.date, t))}</th>
                  <th scope="col" className={styles.rightCell}>{t.writing.change}</th>
                </tr>
              </thead>
              <tbody>
                {BANDS.map((band) => {
                  const before = original.row.piece[band.name];
                  const after = rewrite.row.piece[band.name];
                  const diff = before === null || after === null ? null : after - before;
                  return (
                    <tr key={band.name}>
                      <th scope="row">{band.label}</th>
                      <td className={styles.center}>{bandValue(before, t)}</td>
                      <td className={`${styles.center} ${styles.strong}`}>{bandValue(after, t)}</td>
                      <td className={`${styles.rightCell} ${diff !== null && diff > 0 ? ui.ok : diff !== null && diff < 0 ? ui.dangerText : styles.muted}`}>
                        {diff === null ? '—' : diff > 0 ? `+${decimal(diff, t)}` : diff === 0 ? '=' : decimal(diff, t)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={ui.help}>
              {pair.pctRepeated === null
                ? t.writing.originalNoErrors
                : t.writing.pairRepeat(pair.repeatedErrors, pair.originalErrors, percent(pair.pctRepeated, t))}{' '}
              <Link href={`/registrar?s=${String(original.row.piece.sessionId)}`}>{t.writing.originalErrors}</Link>
              {' · '}
              <Link href={`/registrar?s=${String(rewrite.row.piece.sessionId)}`}>{t.writing.rewriteErrorsLink}</Link>
            </p>
          </section>
        );
      })}
    </div>
  );
}
