import Link from 'next/link';

import { getDb } from '@/lib/db/client';
import { loadDataset } from '@/lib/db/load';
import {
  getWritingPiece,
  listWritingPieces,
  writingSessionsWithoutPiece,
} from '@/lib/db/repo';
import { REWRITE_REPEAT_PCT } from '@/lib/domain/thresholds';
import { q6RewriteEfficacy } from '@/lib/queries/q6RewriteEfficacy';
import { toIsoDate } from '@/lib/time/dates';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import ui from '../_shared/ui.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { CORRECTOR_LABELS, GENRE_LABELS } from '../_shared/labels';
import { PieceForm } from './PieceForm';
import styles from './writing.module.css';

/**
 * Writing. Alta y edicion de textos con las cuatro bandas, y Q6 debajo.
 *
 * Q6 es la que dice si reescribir sirve de algo: de los errores del original, cuantos
 * reaparecen. Por encima del umbral, el problema no es escribir mejor, es no haber
 * leido la correccion.
 */

export const dynamic = 'force-dynamic';

export default async function WritingPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);
  const db = getDb();

  const editParam = params['edit'];
  const editingId = typeof editParam === 'string' ? Number(editParam) : Number.NaN;
  const editing = Number.isInteger(editingId) ? getWritingPiece(db, editingId) : null;

  const pieces = listWritingPieces(db);
  const q6 = q6RewriteEfficacy(loadDataset(db), { now: new Date(), windowDays });
  const pairByRewrite = new Map(q6.pairs.map((pair) => [pair.rewriteId, pair]));

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Writing</h1>
          <p className={shared.lede}>
            Las cuatro bandas por separado, no una media: lo util es justo lo que la media
            esconde, que una suba mientras otra lleva meses clavada.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/writing" />
      </header>

      <PieceForm
        key={editing?.id ?? 'new'}
        availableSessions={writingSessionsWithoutPiece(db)}
        pieces={pieces}
        editing={editing}
        today={toIsoDate(new Date())}
      />

      <section className={`${ui.panel} ${shared.section}`} aria-labelledby="pieces-heading">
        <div className={shared.panelHead}>
          <h2 id="pieces-heading">Textos</h2>
          <p className={ui.note}>{pieces.length} en total</p>
        </div>

        {pieces.length === 0 ? (
          <p className={ui.empty}>Todavía no hay textos.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="sr-only">Textos de Writing con sus bandas</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Género</th>
                  <th scope="col" className={ui.num}>
                    Palabras
                  </th>
                  <th scope="col">Corrector</th>
                  <th scope="col">C · CA · O · L</th>
                  <th scope="col">Reescritura</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => {
                  const pair = pairByRewrite.get(piece.id);
                  return (
                    <tr key={piece.id}>
                      <td className="data">{piece.id}</td>
                      <td className="data">{piece.date}</td>
                      <td>{GENRE_LABELS[piece.genre]}</td>
                      <td className={ui.num}>{piece.wordCount ?? '—'}</td>
                      <td>{piece.corrector === null ? '—' : CORRECTOR_LABELS[piece.corrector]}</td>
                      <td className={styles.bandsCell}>
                        {[
                          piece.bandContent,
                          piece.bandCommunicative,
                          piece.bandOrganisation,
                          piece.bandLanguage,
                        ]
                          .map((band) => (band === null ? '·' : String(band)))
                          .join(' ')}
                      </td>
                      <td>
                        {piece.rewriteOf === null ? (
                          '—'
                        ) : (
                          <span className={styles.rewriteTag}>de #{piece.rewriteOf}</span>
                        )}
                        {pair !== undefined && pair.pctRepeated !== null && (
                          <span
                            className={
                              pair.pctRepeated > REWRITE_REPEAT_PCT
                                ? styles.repeatBad
                                : styles.repeatOk
                            }
                          >
                            {' '}
                            {pair.pctRepeated}% repetido
                            {pair.pctRepeated > REWRITE_REPEAT_PCT && ' · supera el umbral'}
                          </span>
                        )}
                      </td>
                      <td>
                        <Link href={`/writing?edit=${String(piece.id)}`}>Editar</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${ui.panel} ${shared.section}`} aria-labelledby="q6-heading">
        <div className={shared.panelHead}>
          <h2 id="q6-heading">Eficacia de la reescritura</h2>
          <p className={ui.note}>Umbral {REWRITE_REPEAT_PCT}%</p>
        </div>

        {q6.pairs.length === 0 ? (
          <p className={ui.empty}>
            Ningún par original/reescritura en la ventana. Esta cifra todavía no se puede
            calcular, y la regla 6 queda en «Sin datos».
          </p>
        ) : (
          <>
            <p className={ui.note}>
              {q6.totalRepeated} de {q6.totalOriginalErrors} errores del original
              reaparecen{' '}
              {q6.pctRepeated !== null && (
                <strong
                  className={
                    q6.pctRepeated > REWRITE_REPEAT_PCT ? styles.repeatBad : styles.repeatOk
                  }
                >
                  ({q6.pctRepeated}%{q6.pctRepeated > REWRITE_REPEAT_PCT ? ', por encima del umbral' : ''})
                </strong>
              )}
            </p>

            <div className={`${ui.tableWrap} ${styles.tableGap}`}>
              <table className={ui.table}>
                <caption className="sr-only">Pares original y reescritura</caption>
                <thead>
                  <tr>
                    <th scope="col">Original</th>
                    <th scope="col">Reescritura</th>
                    <th scope="col">Género</th>
                    <th scope="col" className={ui.num}>
                      Errores
                    </th>
                    <th scope="col" className={ui.num}>
                      Repetidos
                    </th>
                    <th scope="col" className={ui.num}>
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q6.pairs.map((pair) => (
                    <tr key={pair.rewriteId}>
                      <td className="data">#{pair.originalId}</td>
                      <td className="data">#{pair.rewriteId}</td>
                      <td>{GENRE_LABELS[pair.genre]}</td>
                      <td className={ui.num}>{pair.originalErrors}</td>
                      <td className={ui.num}>{pair.repeatedErrors}</td>
                      <td className={ui.num}>
                        {pair.pctRepeated === null ? '—' : `${String(pair.pctRepeated)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
