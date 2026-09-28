import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import { writingSessionsWithoutPiece } from '@/lib/db/repo';
import { REWRITE_REPEAT_PCT } from '@/lib/domain/thresholds';
import type { SessionRow, WritingPieceRow } from '@/lib/domain/types';
import { q6RewriteEfficacy } from '@/lib/queries/q6RewriteEfficacy';
import { toIsoDate } from '@/lib/time/dates';
import { percent, sessionTitle, shortDate } from '../_shared/format';
import { CORRECTOR_LABELS, GENRE_LABELS } from '../_shared/labels';
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
    return session === undefined ? `${GENRE_LABELS[piece.genre]} · ${shortDate(piece.date)}` : sessionTitle(session);
  };
  const originals = pieces.map((piece) => ({ id: piece.id, label: `${shortDate(piece.date)} · ${title(piece)} · ${GENRE_LABELS[piece.genre]}` }));
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
          <h1 className={ui.pageTitle}>Writing</h1>
          <WritingEditor
            {...editorProps}
            label="Registrar Writing"
            editing={null}
            editingSession={null}
            initiallyOpen={openNew || Number.isInteger(rewriteOf) && rewriteOf > 0}
            initialSessionId={Number.isInteger(requestedSession) ? requestedSession : null}
            initialRewriteOf={Number.isInteger(rewriteOf) && rewriteOf > 0 ? rewriteOf : null}
          />
        </div>
        <RouteTabs
          label="Vistas de Writing"
          items={[
            { href: '/writing', label: 'Textos', current: tab === 'textos' },
            { href: `/writing?tab=reescrituras${windowDays === 30 ? '' : `&w=${String(windowDays)}`}`, label: 'Reescrituras', current: tab === 'reescrituras' },
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
        <p className={ui.helpWarn} role="status">No encontramos ese registro de Writing: puede que se haya borrado con su sesión.</p>
      )}

      {tab === 'textos' ? (
        <Texts pieces={pieces} sessionById={sessionById} pieceById={pieceById} title={title} editHref={editHref} />
      ) : (
        <Rewrites data={data} windowDays={windowDays} pieceById={pieceById} title={title} />
      )}
    </div>
  );
}

function bandValue(value: number | null) {
  return value === null
    ? <span className={styles.unrated}>Sin evaluar</span>
    : <span className="num">{value}</span>;
}

function Texts({ pieces, sessionById, pieceById, title, editHref }: {
  readonly pieces: readonly WritingPieceRow[];
  readonly sessionById: ReadonlyMap<number, SessionRow>;
  readonly pieceById: ReadonlyMap<number, WritingPieceRow>;
  readonly title: (piece: WritingPieceRow) => string;
  readonly editHref: (id: number) => string;
}) {
  if (pieces.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Todavía no hay textos de Writing. Registra la evaluación de un texto cuando lo tengas corregido.</p>
      </div>
    );
  }
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className="sr-only">Textos de Writing con sus cuatro bandas</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.colDate}>Fecha</th>
            <th scope="col">Referencia</th>
            <th scope="col" className={styles.colGenre}>Género</th>
            {BANDS.map((band) => (
              <th key={band.name} scope="col" className={styles.colBand}><abbr title={band.label}>{band.short}</abbr></th>
            ))}
            <th scope="col" className={styles.colCorrector}>Corrector</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((piece) => {
            const original = piece.rewriteOf === null ? null : pieceById.get(piece.rewriteOf) ?? null;
            const session = sessionById.get(piece.sessionId);
            const sub = original !== null
              ? `Reescribe «${title(original)}» del ${shortDate(original.date)}`
              : piece.corrector === null && BANDS.every((band) => piece[band.name] === null)
                ? 'Sin corregir'
                : [piece.wordCount === null ? null : `${String(piece.wordCount)} palabras`, piece.minutes === null ? null : `${String(piece.minutes)} min`]
                  .filter((part) => part !== null).join(' · ') || (session === undefined ? '' : `Writing Part ${String(session.part)}`);
            return (
              <tr key={piece.id}>
                <td className={`${styles.colDate} ${styles.muted}`}>{shortDate(piece.date)}</td>
                <td>
                  <span className={ui.cellStack}>
                    <Link href={editHref(piece.id)} className={styles.ref} scroll={false}>{title(piece)}</Link>
                    <span className={`${ui.cellSub} ${ui.ellipsis}`}>{sub}</span>
                  </span>
                </td>
                <td className={styles.colGenre}>{GENRE_LABELS[piece.genre]}</td>
                <td className={styles.colBand}>{bandValue(piece.bandContent)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandCommunicative)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandOrganisation)}</td>
                <td className={styles.colBand}>{bandValue(piece.bandLanguage)}</td>
                <td className={`${styles.colCorrector} ${styles.muted}`}>{piece.corrector === null ? '—' : CORRECTOR_LABELS[piece.corrector]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rewrites({ data, windowDays, pieceById, title }: {
  readonly data: ReturnType<typeof loadDataset>;
  readonly windowDays: number;
  readonly pieceById: ReadonlyMap<number, WritingPieceRow>;
  readonly title: (piece: WritingPieceRow) => string;
}) {
  const q6 = q6RewriteEfficacy(data, { now: new Date(), windowDays });
  return (
    <div className={styles.rewrites}>
      <div className={styles.rewritesHead}>
        <p className={ui.help}>
          {q6.pairs.length === 0
            ? `Ningún par original y reescritura en los últimos ${String(windowDays)} días.`
            : q6.pctRepeated === null
              ? 'Los originales no tenían errores registrados: no hay nada que comparar.'
              : `${String(q6.totalRepeated)} de ${String(q6.totalOriginalErrors)} errores de los originales se repiten al reescribir (${percent(q6.pctRepeated)}; umbral ${String(REWRITE_REPEAT_PCT)} %). Mismo error = misma categoría, subcategoría y corrección.`}
        </p>
        <WindowSwitch current={windowDays} basePath="/writing" keep={{ tab: 'reescrituras' }} label="Periodo de las reescrituras" />
      </div>
      {q6.pairs.map((pair) => {
        const original = pieceById.get(pair.originalId);
        const rewrite = pieceById.get(pair.rewriteId);
        if (original === undefined || rewrite === undefined) return null;
        return (
          <section key={pair.rewriteId} className={styles.pair} aria-label={`${title(original)} y su reescritura`}>
            <h2 className={styles.pairTitle}>{title(original)} → Reescritura</h2>
            <table className={styles.compare}>
              <caption className="sr-only">Bandas del original y de la reescritura</caption>
              <thead>
                <tr>
                  <th scope="col">Banda</th>
                  <th scope="col" className={styles.center}>Original · {shortDate(original.date)}</th>
                  <th scope="col" className={styles.center}>Nueva · {shortDate(rewrite.date)}</th>
                  <th scope="col" className={styles.rightCell}>Cambio</th>
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
                      <td className={styles.center}>{bandValue(before)}</td>
                      <td className={`${styles.center} ${styles.strong}`}>{bandValue(after)}</td>
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
                ? 'El original no tenía errores registrados.'
                : `${String(pair.repeatedErrors)} de ${String(pair.originalErrors)} errores del original se repiten en la reescritura (${percent(pair.pctRepeated)}).`}{' '}
              <Link href={`/registrar?s=${String(original.sessionId)}`}>Errores del original</Link>
              {' · '}
              <Link href={`/registrar?s=${String(rewrite.sessionId)}`}>de la reescritura</Link>
            </p>
          </section>
        );
      })}
    </div>
  );
}
