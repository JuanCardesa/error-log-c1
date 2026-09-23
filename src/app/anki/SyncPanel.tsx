'use client';

import { useState, useTransition } from 'react';
import { syncAnkiAction } from './actions';
import styles from './anki.module.css';
import ui from '../_shared/ui.module.css';

/**
 * La hora del corte se afirma segun de donde venga. AnkiConnect no la expone hoy
 * —verificado contra una instalacion real—, asi que lo habitual es la suposicion, y
 * entonces hay que decir como corregirla en vez de enseñar una cifra con aire de leida.
 */
const ROLLOVER_NOTE: Readonly<Record<'config' | 'default', (hour: string) => string>> = {
  config: (hour) => `Día de Anki: empieza a las ${hour}, según ANKI_ROLLOVER_HOUR. Los recuentos usan ese corte.`,
  default: (hour) => `Día de Anki: se supone que empieza a las ${hour}, el valor por defecto de Anki. Tu AnkiConnect no expone ese dato; si tu colección usa otra hora, ponla en ANKI_ROLLOVER_HOUR y vuelve a sincronizar.`,
};

export function SyncPanel({ message, lastSyncedAt, deck, rolloverHour, rolloverSource }: {
  readonly message: string; readonly lastSyncedAt: string | null; readonly deck: string;
  readonly rolloverHour: number | null;
  readonly rolloverSource: 'config' | 'default' | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <section className={styles.sync} aria-labelledby="sync-heading">
      <div className={styles.info}>
        <h2 id="sync-heading">Conexión con Anki</h2>
        <p id="anki-status">{message}</p>
        <p className={ui.note}>Mazo: {deck} y sus submazos.</p>
        {rolloverHour !== null && rolloverSource !== null && <p className={ui.note}>
          {ROLLOVER_NOTE[rolloverSource](`${String(rolloverHour)}:00`)}
        </p>}
        <p className={ui.note}>Última sincronización: {lastSyncedAt === null ? 'todavía no se ha sincronizado' : <time dateTime={lastSyncedAt}>{new Date(lastSyncedAt).toLocaleString('es-ES')}</time>}</p>
        <details>
          <summary>Cómo conectar Anki</summary>
          <p>En Anki: Herramientas → Complementos → Descargar complementos. Instala{' '}
            <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">AnkiConnect (2055492159)</a>,
            reinicia Anki y deja abierto el perfil de tu colección. Después pulsa Sincronizar.</p>
        </details>
      </div>
      <div>
        <button type="button" className={ui.secondary} disabled={pending} aria-busy={pending}
          onClick={() => startTransition(async () => { setResult(await syncAnkiAction()); })}>
          {pending ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        {result !== null && <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
      </div>
    </section>
  );
}
