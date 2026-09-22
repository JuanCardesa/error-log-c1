import { z } from 'zod';
import { AnkiError } from './connect';
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
  /** Cartas por peticion al leer la coleccion. */
  readonly batchSize: number;
  /** Tope de tiempo para una sincronizacion entera. */
  readonly syncBudgetMs: number;
  readonly disabled: boolean;
}

/**
 * Medido recorriendo una coleccion de 3000 cartas: con lotes de 100 son 4260 ms, con 250
 * son 2579, con 500 son 2535 y con 1000 son 2387. Cada peticion paga unos 30 ms fijos del
 * bucle de Qt de AnkiConnect, asi que los lotes pequenos se van en esa espera; a partir de
 * 250 la curva se aplana y lo unico que crece es la memoria por respuesta, que ya son
 * 2,87 MB por lote porque `cardsInfo` devuelve pregunta y respuesta renderizadas.
 */
const BATCH_SIZE = 250;

/**
 * Tope para la sincronizacion entera. Con la coleccion medida son 2,6 s y con 10 000
 * cartas rondarian 8,6 s, asi que tres minutos solo se alcanzan si Anki no responde:
 * antes que dejar la pantalla girando sin final, se corta y se dice por que.
 */
const SYNC_BUDGET_MS = 180_000;

function positiveInt(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new AnkiError('ANKI_CONFIG', `${name} debe ser un entero entre 1 y ${String(max)}.`);
  }
  return value;
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

const textSchema = (max: number) => z.string().min(1).max(max)
  .refine((value) => value.trim().length > 0 && !/\p{Cc}/u.test(value));

function configText(name: string, value: unknown, max: number): string {
  const parsed = textSchema(max).safeParse(value);
  if (!parsed.success) {
    throw new AnkiError('ANKI_CONFIG', `${name} debe ser una cadena no vacía de hasta ${String(max)} caracteres, sin caracteres de control.`);
  }
  return parsed.data;
}

function connectUrl(raw: unknown): URL {
  const value = configText('ANKI_CONNECT_URL', raw, 2048);
  let url: URL;
  try { url = new URL(value); }
  catch { throw new AnkiError('ANKI_CONFIG', 'ANKI_CONNECT_URL debe ser una URL HTTP o HTTPS válida de este equipo, con puerto entre 1 y 65535.'); }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
    || port < 1 || port > 65535 || url.href.length > 2048) {
    throw new AnkiError('ANKI_CONFIG', 'ANKI_CONNECT_URL debe apuntar a AnkiConnect en este equipo, con puerto entre 1 y 65535 y sin credenciales, consulta ni fragmento.');
  }
  return url;
}

/** Solo el servidor habla con el complemento local; nunca se envía la clave al cliente. */
export function ankiConfig(env: Readonly<Record<string, string | undefined>> = process.env): AnkiConfig {
  const demo = env['ERRORLOG_DEMO'] === '1';
  const e2e = env['ERRORLOG_E2E'] === '1';
  // La demo nunca habla con Anki. Los e2e solo pueden hablar con el doble que arranca
  // Playwright, cuya URL se inyecta aquí: `ANKI_CONNECT_URL` queda fuera de juego, así
  // que ninguna configuración heredada del entorno puede devolverlos a la colección real.
  const fakeUrl = e2e && !demo ? env['ERRORLOG_ANKI_FAKE_URL'] : undefined;
  const url = connectUrl(fakeUrl ?? env['ANKI_CONNECT_URL'] ?? `http://127.0.0.1:${ANKI_CONNECT_PORT}`);
  // Un doble en el puerto real dejaría de ser un doble.
  if (fakeUrl !== undefined && (url.port === ANKI_CONNECT_PORT || url.port === '')) {
    throw new AnkiError('ANKI_CONFIG', `El doble de AnkiConnect no puede escuchar en el puerto ${ANKI_CONNECT_PORT}.`);
  }
  const rollover = env['ANKI_ROLLOVER_HOUR']?.trim();
  if (rollover !== undefined && rollover !== '' && !isRolloverHour(Number(rollover))) {
    throw new AnkiError('ANKI_CONFIG', 'ANKI_ROLLOVER_HOUR debe ser una hora entera entre 0 y 23.');
  }
  const sourceDeck = configText('ANKI_SOURCE_DECK', env['ANKI_SOURCE_DECK'] ?? 'English B2 to C1 Practice', 256).trim();
  const targetDeck = configText('ANKI_TARGET_DECK', env['ANKI_TARGET_DECK'] ?? `${sourceDeck}::Error Log`, 256).trim();
  const apiKey = env['ANKI_CONNECT_API_KEY'] === undefined ? undefined
    : configText('ANKI_CONNECT_API_KEY', env['ANKI_CONNECT_API_KEY'], 1024);
  return {
    url: url.href,
    sourceDeck,
    targetDeck,
    apiKey,
    ...(rollover !== undefined && rollover !== '' ? { rolloverHour: Number(rollover) } : {}),
    statusTtlMs: demo || e2e ? 0 : STATUS_TTL_MS,
    batchSize: positiveInt(env, 'ANKI_BATCH_SIZE', BATCH_SIZE, 2000),
    syncBudgetMs: positiveInt(env, 'ANKI_SYNC_BUDGET_MS', SYNC_BUDGET_MS, 3_600_000),
    // Sin doble inyectado, la demo y los e2e no leen ni escriben ninguna colección.
    disabled: (demo || e2e) && fakeUrl === undefined,
  };
}
