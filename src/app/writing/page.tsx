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
import { decimal, mediumDate, percent, shortDate, signedDecimal } from '../_shared/format';
import { EmptyState } from '../_shared/EmptyState';
import { getT } from '../_shared/i18nServer';
import { PageHeader } from '../_shared/PageHeader';
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
      <PageHeader
        title={t.nav.writing}
        actions={(
          <>
            {/* El periodo solo mueve Reescrituras: va arriba, como en Progreso, y solo en esa pestaña. */}
            {tab === 'reescrituras' && (
              <WindowSwitch current={windowDays} basePath="/writing" keep={{ tab: 'reescrituras' }} label={w.rewritesPeriod} />
            )}
            <Link href="/writing/importar" className={ui.primary}>
              <Upload size={16} aria-hidden="true" />
              {t.writingImport.title}
            </Link>
          </>
        )}
        tabs={(
          <RouteTabs
            label={w.views}
            items={[
              { href: '/writing', label: w.library, current: tab === 'biblioteca' },
              { href: '/writing?tab=progreso', label: w.progressTab, current: tab === 'progreso' },
              { href: `/writing?tab=reescrituras${windowDays === 30 ? '' : `&w=${String(windowDays)}`}`, label: w.rewrites, current: tab === 'reescrituras' },
            ]}
          />
        )}
      />

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
      <EmptyState cause={w.empty} action={<Link href="/writing/importar" className={ui.textLink}>{t.writingImport.title}</Link>} />
    );
  }
  const shown = selectLibrary(items, query);
  return (
    <section className={styles.library} aria-label={w.library}>
      <LibraryToolbar query={query} counts={countByStatus(searchLibrary(items, query))} />
      {shown.length === 0 ? (
        <EmptyState
          cause={query.q.trim() !== '' ? w.noMatchQuery(query.q.trim())
            : query.status === 'AWAITING' && query.genre === null ? w.noAwaiting : w.noMatchFilters}
          action={isFiltered(query) ? <Link href="/writing" className={ui.textLink}>{t.common.clearFilters}</Link> : undefined}
        />
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
      <p className={ui.help}>
        {q6.pairs.length === 0
          ? t.writing.noPairs(windowDays)
          : q6.pctRepeated === null
            ? t.writing.noOriginalErrors
            : t.writing.repeatSummary(q6.totalRepeated, q6.totalOriginalErrors, percent(q6.pctRepeated, t), percent(REWRITE_REPEAT_PCT, t))}
      </p>
      {q6.pairs.map((pair) => {
        const original = byId.get(pair.originalId);
        const rewrite = byId.get(pair.rewriteId);
        if (original === undefined || rewrite === undefined) return null;
        return (
          <section key={pair.rewriteId} className={styles.pair} aria-label={t.writing.pairLabel(original.title)}>
            <h2 className={styles.pairTitle}>{t.writing.pairTitle(original.title)}</h2>
            <div className={ui.scrollX}>
              <table className={ui.dataTable}>
                <caption className="sr-only">{t.writing.compareCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.writing.band}</th>
                    <th scope="col" className={ui.colNum}>{t.writing.originalCol(shortDate(original.date, t))}</th>
                    <th scope="col" className={ui.colNum}>{t.writing.newCol(shortDate(rewrite.date, t))}</th>
                    <th scope="col" className={ui.colNum}>{t.writing.change}</th>
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
                        <td className={ui.colNum}>{bandValue(before, t)}</td>
                        <td className={`${ui.colNum} ${styles.strong}`}>{bandValue(after, t)}</td>
                        <td className={`${ui.colNum} ${diff === null || diff === 0 ? styles.muted : styles.strong}`}>
                          {diff === null ? '—' : signedDecimal(diff, t)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
