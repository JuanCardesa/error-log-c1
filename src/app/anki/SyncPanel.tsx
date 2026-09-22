'use client';

import { useState, useTransition } from 'react';
import { syncAnkiAction } from './actions';
import styles from './anki.module.css';

/**
 * La hora del corte se afirma segun de donde venga. AnkiConnect no la expone hoy
 * —verificado contra una instalacion real—, asi que lo habitual es la suposicion, y
 * entonces hay que decir como corregirla en vez de enseñar una cifra con aire de leida.
 */
const ROLLOVER_NOTE: Readonly<Record<'anki' | 'config' | 'default', (hour: string) => string>> = {
  anki: (hour) => `Día de Anki: empieza a las ${hour}, según tu colección. Los recuentos usan ese corte.`,
  config: (hour) => `Día de Anki: empieza a las ${hour}, según ANKI_ROLLOVER_HOUR. Los recuentos usan ese corte.`,
  default: (hour) => `Día de Anki: se supone que empieza a las ${hour}, el valor por defecto de Anki. Tu AnkiConnect no expone ese dato; si tu colección usa otra hora, ponla en ANKI_ROLLOVER_HOUR y vuelve a sincronizar.`,
};

export function SyncPanel({ message, lastSyncedAt, deck, rolloverHour, rolloverSource }: {
  readonly message: string; readonly lastSyncedAt: string | null; readonly deck: string;
  readonly rolloverHour: number | null;
  readonly rolloverSource: 'anki' | 'config' | 'default' | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <section className={styles.sync} aria-labelledby="sync-heading">
      <div>
        <h2 id="sync-heading">Conexión con Anki</h2>
        <p id="anki-status">{message}</p>
        <p className={styles.hint}>Mazo: {deck} y sus submazos.</p>
        {rolloverHour !== null && rolloverSource !== null && <p className={styles.hint}>
          {ROLLOVER_NOTE[rolloverSource](`${String(rolloverHour)}:00`)}
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
