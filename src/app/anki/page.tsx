import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { ankiConfig } from '@/lib/anki/config';
import { ankiStatus } from '@/lib/anki/sync';
import { q7AnkiReviews } from '@/lib/queries/q7AnkiReviews';
import { ANKI_TARGET_PCT } from '@/lib/domain/thresholds';
import { q5AnkiDebt } from '@/lib/queries/q5AnkiDebt';
import { WindowSwitch } from '../_shared/WindowSwitch';
import shared from '../_shared/report.module.css';
import { type SearchParams, parseWindow } from '../_shared/window';
import { QueueItem, UndoButton } from './QueueItem';
import styles from './anki.module.css';
import { SyncPanel } from './SyncPanel';
import { ReviewFailures } from './ReviewFailures';

/**
 * Cola de conversion a Anki.
 *
 * Solo entran las causas que generan tarjeta. Un DESPISTE no aparece aqui por diseño:
 * no se arregla estudiando, y meterlo en la cola es el error clasico de los error logs
 * caseros.
 */

export const dynamic = 'force-dynamic';

export default async function AnkiPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const windowDays = parseWindow(params['w']);

  const data = loadDataset(getDb());
  const q5 = q5AnkiDebt(data, { now: new Date(), windowDays });
  const anki = loadAnkiDataset(getDb());
  const status = await ankiStatus(getDb());
  const reviews = q7AnkiReviews(anki, { now: new Date(), windowDays });

  const dateOf = new Map(data.sessions.map((session) => [session.id, session.date]));
  const converted = data.errors
    .filter((error) => error.ankiAdded && error.ankiAddedAt !== null)
    .sort((a, b) => (b.ankiAddedAt ?? '').localeCompare(a.ankiAddedAt ?? ''))
    .slice(0, 8);

  return (
    <div>
      <header className={shared.head}>
        <div>
          <h1>Anki</h1>
          <p className={shared.lede}>
            Errores de los ultimos {windowDays} dias cuya causa genera tarjeta. Por debajo
            del {ANKI_TARGET_PCT}% convertido, el log no cierra el circulo.
          </p>
        </div>
        <WindowSwitch current={windowDays} basePath="/anki" />
      </header>

      <SyncPanel message={status.message} lastSyncedAt={anki.sync?.lastSyncedAt ?? null}
        deck={ankiConfig().sourceDeck} rolloverHour={anki.sync?.rolloverHour ?? null}
        rolloverSource={anki.sync?.rolloverSource ?? null} />
      <h2>Cola de conversión</h2>
      <p className={shared.note}>La conversión incluye tarjetas verificadas y marcas manuales. Marcar a mano no comprueba que exista la tarjeta. Deshacer devuelve el error a la cola y conserva la nota en Anki.</p>

      <dl className={styles.summary}>
        <div>
          <dt>Convertidos</dt>
          <dd>{q5.pctConverted === null ? '—' : `${String(q5.pctConverted)}%`}</dd>
        </div>
        <div>
          <dt>Pendientes</dt>
          <dd>{q5.pending}</dd>
        </div>
        <div>
          <dt>Elegibles</dt>
          <dd>{q5.eligible}</dd>
        </div>
      </dl>

      {q5.queue.length === 0 ? (
        <p className={shared.empty}>
          {q5.eligible === 0
            ? 'Ningun error de la ventana genera tarjeta.'
            : 'Cola vacia: todo lo que genera tarjeta ya esta convertido.'}
        </p>
      ) : (
        <ul className={styles.queue}>
          {q5.queue.map((error) => (
            <QueueItem
              key={error.id}
              error={error}
              date={dateOf.get(error.sessionId) ?? ''}
              available={status.available}
            />
          ))}
        </ul>
      )}

      {converted.length > 0 && (
        <section className={styles.done} aria-labelledby="done-heading">
          <h2 id="done-heading">Convertidas recientemente</h2>
          <ul className={styles.doneList}>
            {converted.map((error) => (
              <li key={error.id} className={styles.doneItem}>
                <span className="data">{(error.ankiAddedAt ?? '').slice(0, 10)}</span>
                <span className="data">{error.correctAnswer}</span>
                <span className={shared.note}>{error.category}</span>
                <span className={shared.note}>{error.ankiNoteId === null ? 'Marcada a mano' : 'Verificada en Anki'}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <UndoButton id={error.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ReviewFailures result={reviews} windowDays={windowDays} synced={anki.sync?.lastSyncedAt != null} />
    </div>
  );
}
