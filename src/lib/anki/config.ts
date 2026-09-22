import { isRolloverHour } from './schedule';

export interface AnkiConfig {
  readonly url: string;
  readonly sourceDeck: string;
  readonly targetDeck: string;
  readonly apiKey?: string;
  /** Corte de dia declarado a mano. AnkiConnect no expone el de la coleccion. */
  readonly rolloverHour?: number;
  /** Cuanto vale el estado de conexion antes de volver a preguntar. Cero en las pruebas. */
  readonly statusTtlMs: number;
  readonly disabled: boolean;
}

/**
 * Preguntar el estado cuesta unos 67 ms medidos: AnkiConnect atiende en el bucle de Qt y
 * cada llamada paga esa espera. Guardarlo unos segundos evita pagarlo en cada render de
 * una pagina que es `force-dynamic`. En demo y e2e vale cero: ahi el estado se cambia a
 * proposito de un test a otro y una ventana de gracia haria los resultados no repetibles.
 */
const STATUS_TTL_MS = 5_000;

/** Puerto por defecto del complemento real. El doble tiene prohibido usarlo. */
const ANKI_CONNECT_PORT = '8765';

/** Solo el servidor habla con el complemento local; nunca se envía la clave al cliente. */
export function ankiConfig(env: Readonly<Record<string, string | undefined>> = process.env): AnkiConfig {
  const demo = env['ERRORLOG_DEMO'] === '1';
  const e2e = env['ERRORLOG_E2E'] === '1';
  // La demo nunca habla con Anki. Los e2e solo pueden hablar con el doble que arranca
  // Playwright, cuya URL se inyecta aquí: `ANKI_CONNECT_URL` queda fuera de juego, así
  // que ninguna configuración heredada del entorno puede devolverlos a la colección real.
  const fakeUrl = e2e && !demo ? env['ERRORLOG_ANKI_FAKE_URL'] : undefined;
  const url = new URL(fakeUrl ?? env['ANKI_CONNECT_URL'] ?? `http://127.0.0.1:${ANKI_CONNECT_PORT}`);
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('ANKI_CONNECT_URL debe apuntar a AnkiConnect en este equipo.');
  }
  // Un doble en el puerto real dejaría de ser un doble.
  if (fakeUrl !== undefined && (url.port === ANKI_CONNECT_PORT || url.port === '')) {
    throw new Error(`El doble de AnkiConnect no puede escuchar en el puerto ${ANKI_CONNECT_PORT}.`);
  }
  const rollover = env['ANKI_ROLLOVER_HOUR']?.trim();
  if (rollover !== undefined && rollover !== '' && !isRolloverHour(Number(rollover))) {
    throw new Error('ANKI_ROLLOVER_HOUR debe ser una hora entera entre 0 y 23.');
  }
  const sourceDeck = env['ANKI_SOURCE_DECK']?.trim() || 'English B2 to C1 Practice';
  return {
    url: url.href,
    sourceDeck,
    targetDeck: env['ANKI_TARGET_DECK']?.trim() || `${sourceDeck}::Error Log`,
    apiKey: env['ANKI_CONNECT_API_KEY'],
    ...(rollover !== undefined && rollover !== '' ? { rolloverHour: Number(rollover) } : {}),
    statusTtlMs: demo || e2e ? 0 : STATUS_TTL_MS,
    // Sin doble inyectado, la demo y los e2e no leen ni escriben ninguna colección.
    disabled: (demo || e2e) && fakeUrl === undefined,
  };
}
