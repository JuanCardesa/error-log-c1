import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { writingSessionsWithoutPiece } from '@/lib/db/repo';
import { REWRITE_REPEAT_PCT } from '@/lib/domain/thresholds';
import type { SessionRow, WritingPieceRow } from '@/lib/domain/types';
import type { Messages } from '@/lib/i18n';
import { q6RewriteEfficacy } from '@/lib/queries/q6RewriteEfficacy';
import { toIsoDate } from '@/lib/time/dates';
import { percent, sessionTitle, shortDate } from '../_shared/format';
import { getT } from '../_shared/i18nServer';
import { RouteTabs } from '../_shared/RouteTabs';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { WindowSwitch } from '../_shared/WindowSwitch';
import { BANDS } from './bands';
import { WritingEditor } from './PieceForm';
import styles from './writing.module.css';

/**
 * Writing: la colección de textos con sus cuatro bandas por separado, y la eficacia de
 * las reescrituras (Q6). El periodo solo afecta a Reescrituras: la colección es siempre
 * el historial entero.
 */

export const dynamic = 'force-dynamic';

const one = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

export default async function WritingPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = await getT();
  const tab = one(params['tab']) === 'reescrituras' ? 'reescrituras' : 'textos';
  const windowDays = parseWindow(params['w']);
  const db = getDb();
  const data = loadDataset(db);
  const today = toIsoDate(new Date());
  const sessionById = new Map(data.sessions.map((session) => [session.id, session]));
  const pieces = [...data.pieces].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const title = (piece: WritingPieceRow): string => {
    const session = sessionById.get(piece.sessionId);
    return session === undefined ? `${t.labels.genre[piece.genre]} · ${shortDate(piece.date, t)}` : sessionTitle(session, t);
  };
  const originals = pieces.map((piece) => ({ id: piece.id, label: `${shortDate(piece.date, t)} · ${title(piece)} · ${t.labels.genre[piece.genre]}` }));
  const available = writingSessionsWithoutPiece(db);

  const editId = Number(one(params['edit']));
  const editing = Number.isInteger(editId) ? pieceById.get(editId) ?? null : null;
  const openNew = one(params['registrar']) === '1';
  const requestedSession = Number(one(params['sesion']));
  const rewriteOf = Number(one(params['reescritura']));
  const tabQuery = tab === 'reescrituras' ? '?tab=reescrituras' : '';
  const editHref = (id: number) => `/writing?edit=${String(id)}${tab === 'reescrituras' ? '&tab=reescrituras' : ''}`;
  const editorProps = { availableSessions: available, originals, today, closeHref: `/writing${tabQuery}` };

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1 className={ui.pageTitle}>{t.nav.writing}</h1>
          <WritingEditor
            {...editorProps}
            label={t.writing.logWriting}
            editing={null}
            editingSession={null}
            initiallyOpen={openNew || Number.isInteger(rewriteOf) && rewriteOf > 0}
            initialSessionId={Number.isInteger(requestedSession) ? requestedSession : null}
            initialRewriteOf={Number.isInteger(rewriteOf) && rewriteOf > 0 ? rewriteOf : null}
          />
        </div>
        <RouteTabs
          label={t.writing.views}
          items={[
            { href: '/writing', label: t.writing.texts, current: tab === 'textos' },
            { href: `/writing?tab=reescrituras${windowDays === 30 ? '' : `&w=${String(windowDays)}`}`, label: t.writing.rewrites, current: tab === 'reescrituras' },
          ]}
        />
      </div>

      {editing !== null && (
        <WritingEditor
          key={editing.id}
          {...editorProps}
          editing={editing}
          editingSession={sessionById.get(editing.sessionId) ?? null}
          initiallyOpen
          initialSessionId={null}
          initialRewriteOf={null}
        />
      )}
      {one(params['edit']) !== '' && editing === null && (
        <p className={ui.helpWarn} role="status">{t.writing.notFound}</p>
      )}

      {tab === 'textos' ? (
        <Texts pieces={pieces} sessionById={sessionById} pieceById={pieceById} title={title} editHref={editHref} t={t} />
      ) : (
        <Rewrites data={data} windowDays={windowDays} pieceById={pieceById} title={title} t={t} />
      )}
    </div>
  );
}

function bandValue(value: number | null, t: Messages) {
  return value === null
    ? <span className={styles.unrated}>{t.writing.unrated}</span>
    : <span className="num">{value}</span>;
}

function Texts({ pieces, sessionById, pieceById, title, editHref, t }: {
  readonly pieces: readonly WritingPieceRow[];
  readonly sessionById: ReadonlyMap<number, SessionRow>;
  readonly pieceById: ReadonlyMap<number, WritingPieceRow>;
  readonly title: (piece: WritingPieceRow) => string;
  readonly editHref: (id: number) => string;
  readonly t: Messages;
}) {
  if (pieces.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t.writing.empty}</p>
      </div>
    );
  }
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className="sr-only">{t.writing.textsCaption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.colDate}>{t.sessionForm.date}</th>
            <th scope="col">{t.sessionForm.reference}</th>
            <th scope="col" className={styles.colGenre}>{t.writing.genre}</th>
            {BANDS.map((band) => (
              <th key={band.name} scope="col" className={styles.colBand}><abbr title={band.label}>{band.short}</abbr></th>
            ))}
            <th scope="col" className={styles.colCorrector}>{t.writing.corrector}</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((piece) => {
            const original = piece.rewriteOf === null ? null : pieceById.get(piece.rewriteOf) ?? null;
            const session = sessionById.get(piece.sessionId);
            const sub = original !== null
              ? t.writing.rewritesOf(title(original), shortDate(original.date, t))
              : piece.corrector === null && BANDS.every((band) => piece[band.name] === null)
                ? t.writing.notMarked
                : [piece.wordCount === null ? null : t.writing.words(piece.wordCount), piece.minutes === null ? null : `${String(piece.minutes)} min`]
                  .filter((part) => part !== null).join(' · ') || (session === undefined ? '' : `Writing ${t.format.part(session.part)}`);
            return (
              <tr key={piece.id}>
                <td className={`${styles.colDate} ${styles.muted}`}>{shortDate(piece.date, t)}</td>
                <td>
                  <span className={ui.cellStack}>
                    <Link href={editHref(piece.id)} className={styles.ref} scroll={false}>{title(piece)}</Link>
                    <span className={`${ui.cellSub} ${ui.ellipsis}`}>{sub}</span>
                  </span>
                </td>
                <td className={styles.colGenre}>{t.labels.genre[piece.genre]}</td>
                <td className={styles.colBand}>{bandValue(piece.bandContent, t)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandCommunicative, t)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandOrganisation, t)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandLanguage, t)}</td>
                <td className={`${styles.colCorrector} ${styles.muted}`}>{piece.corrector === null ? '—' : t.labels.corrector[piece.corrector]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rewrites({ data, windowDays, pieceById, title, t }: {
  readonly data: ReturnType<typeof loadDataset>;
  readonly windowDays: number;
  readonly pieceById: ReadonlyMap<number, WritingPieceRow>;
  readonly title: (piece: WritingPieceRow) => string;
  readonly t: Messages;
}) {
  const q6 = q6RewriteEfficacy(data, { now: new Date(), windowDays });
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
        const original = pieceById.get(pair.originalId);
        const rewrite = pieceById.get(pair.rewriteId);
        if (original === undefined || rewrite === undefined) return null;
        return (
          <section key={pair.rewriteId} className={styles.pair} aria-label={t.writing.pairLabel(title(original))}>
            <h2 className={styles.pairTitle}>{t.writing.pairTitle(title(original))}</h2>
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
                  const before = original[band.name];
                  const after = rewrite[band.name];
                  const diff = before === null || after === null ? null : after - before;
                  return (
                    <tr key={band.name}>
                      <th scope="row">{band.label}</th>
                      <td className={styles.center}>{bandValue(before, t)}</td>
                      <td className={`${styles.center} ${styles.strong}`}>{bandValue(after, t)}</td>
                      <td className={`${styles.rightCell} ${diff !== null && diff > 0 ? ui.ok : diff !== null && diff < 0 ? ui.dangerText : styles.muted}`}>
                        {diff === null ? '—' : diff > 0 ? `+${String(diff)}` : diff === 0 ? '=' : String(diff)}
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
              <Link href={`/registrar?s=${String(original.sessionId)}`}>{t.writing.originalErrors}</Link>
              {' · '}
              <Link href={`/registrar?s=${String(rewrite.sessionId)}`}>{t.writing.rewriteErrorsLink}</Link>
            </p>
          </section>
        );
      })}
    </div>
  );
}
