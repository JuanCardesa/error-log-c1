'use client';

import { useState, useTransition } from 'react';
import { syncAnkiAction } from './actions';
import styles from './anki.module.css';

export function SyncPanel({ message, lastSyncedAt, deck, rolloverHour }: {
  readonly message: string; readonly lastSyncedAt: string | null; readonly deck: string;
  readonly rolloverHour: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <section className={styles.sync} aria-labelledby="sync-heading">
      <div>
        <h2 id="sync-heading">Conexión con Anki</h2>
        <p id="anki-status">{message}</p>
        <p className={styles.hint}>Mazo: {deck} y sus submazos.</p>
        {rolloverHour !== null && <p className={styles.hint}>
          Día de Anki: empieza a las {rolloverHour}:00, como tu colección. Los recuentos usan ese corte.
        </p>}
        <p className={styles.hint}>Última sincronización: {lastSyncedAt === null ? 'todavía no se ha sincronizado' : <time dateTime={lastSyncedAt}>{new Date(lastSyncedAt).toLocaleString('es-ES')}</time>}</p>
        <details>
          <summary>Cómo conectar Anki</summary>
          <p>En Anki: Herramientas → Complementos → Descargar complementos. Instala{' '}
            <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">AnkiConnect (2055492159)</a>,
            reinicia Anki y deja abierto el perfil de tu colección. Después pulsa Sincronizar.</p>
        </details>
      </div>
      <div>
        <button type="button" className={styles.add} disabled={pending}
          onClick={() => startTransition(async () => { setResult(await syncAnkiAction()); })}>
          {pending ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        {result !== null && <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
      </div>
    </section>
  );
}
