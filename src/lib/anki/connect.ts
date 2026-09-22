import type { AnkiConfig } from './config';

export type AnkiErrorCode = 'ANKI_CERRADO' | 'ANKI_LENTO' | 'ANKI_ERROR' | 'ANKI_RESPUESTA_RARA' | 'ANKI_CONFIG';
export class AnkiError extends Error {
  constructor(readonly code: AnkiErrorCode, message: string) {
    super(message);
    this.name = 'AnkiError';
  }
}

export interface AnkiRequest {
  readonly action: string;
  readonly version: 6;
  readonly params: Record<string, unknown>;
  readonly key?: string;
}
export type Transport = (body: AnkiRequest, signal?: AbortSignal) => Promise<unknown>;

/** Repetirlas no cambia la coleccion. Lo que no este aqui se trata como escritura. */
const READ_ACTIONS: ReadonlySet<string> = new Set([
  'version', 'getActiveProfile', 'deckNames', 'modelNames', 'modelFieldNames', 'getPreferences',
  'findCards', 'findNotes', 'notesInfo', 'cardsInfo', 'getReviewsOfCards', 'multi',
]);

/**
 * Lecturas cuyo coste crece con la coleccion. `cardsInfo` es la cara: devuelve la
 * pregunta y la respuesta ya renderizadas, asi que Anki ejecuta la plantilla de cada
 * carta del lote. Medir contra una coleccion real antes de tocar el tamano de lote.
 */
const BATCH_ACTIONS: ReadonlySet<string> = new Set([
  'findCards', 'findNotes', 'notesInfo', 'cardsInfo', 'getReviewsOfCards', 'multi',
]);

/**
 * Un unico plazo para todo obligaba a elegir entre abortar lotes legitimos y dejar
 * colgado el saludo inicial. La escritura tiene mas margen que el saludo porque un
 * `addNote` que expira deja la duda de si la nota existe.
 */
export const ANKI_TIMEOUT_MS = { quick: 5_000, write: 15_000, batch: 60_000 } as const;

export function timeoutFor(action: string): number {
  if (BATCH_ACTIONS.has(action)) return ANKI_TIMEOUT_MS.batch;
  return READ_ACTIONS.has(action) ? ANKI_TIMEOUT_MS.quick : ANKI_TIMEOUT_MS.write;
}

/** `multi` solo es lectura si todas sus subacciones lo son. */
export function isReadRequest(body: AnkiRequest): boolean {
  if (body.action !== 'multi') return READ_ACTIONS.has(body.action);
  const actions = body.params['actions'];
  return Array.isArray(actions) && actions.length > 0 && actions.every((action) =>
    typeof action === 'object' && action !== null && !Array.isArray(action)
    && READ_ACTIONS.has(String((action as { action?: unknown }).action)));
}

/** `AbortSignal.timeout` aborta con un TimeoutError; fetch puede envolverlo en `cause`. */
function isTimeout(error: unknown): boolean {
  const named = (value: unknown): string => value instanceof Error ? value.name : '';
  const names = [named(error), named(error instanceof Error ? error.cause : undefined)];
  return names.some((name) => name === 'TimeoutError' || name === 'AbortError');
}

export function httpTransport(config: AnkiConfig, fetcher: typeof fetch = globalThis.fetch): Transport {
  return async (body, signal) => {
    signal?.throwIfAborted();
    if (config.disabled) throw new AnkiError('ANKI_CONFIG', 'Anki está desactivado en la demo y en las pruebas.');
    let response: Response;
    // multi vuelve a pasar cada acción por el validador de claves de AnkiConnect.
    const authorized = {
      ...body,
      ...(config.apiKey ? {
        key: config.apiKey,
        ...(body.action === 'multi' && Array.isArray(body.params['actions']) ? {
          params: { ...body.params, actions: (body.params['actions'] as AnkiRequest[]).map((action) => ({ ...action, key: config.apiKey })) },
        } : {}),
      } : {}),
    };
    try {
      response = await fetcher(config.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(authorized),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(timeoutFor(body.action)), ...(signal ? [signal] : [])]),
      });
    } catch (error) {
      signal?.throwIfAborted();
      // Expirar y no poder conectar se arreglan de formas distintas: una espera, la otra no.
      if (isTimeout(error)) {
        throw new AnkiError('ANKI_LENTO', 'Anki tardó demasiado en responder. Con colecciones grandes puede pasar mientras está ocupado; vuelve a intentarlo.');
      }
      throw new AnkiError('ANKI_CERRADO', 'No se puede conectar. Abre Anki con AnkiConnect instalado y vuelve a intentarlo.');
    }
    if (!response.ok) throw new AnkiError('ANKI_ERROR', `AnkiConnect respondió con HTTP ${String(response.status)}.`);
    try { return await response.json() as unknown; }
    catch {
      signal?.throwIfAborted();
      throw new AnkiError('ANKI_RESPUESTA_RARA', 'AnkiConnect no devolvió JSON válido.');
    }
  };
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
  /** Inyectable para que los tests no esperen de verdad. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Reintenta solo lo que puede salir bien al repetirlo: una lectura que expiro porque la
 * coleccion estaba ocupada. Anki cerrado no mejora esperando —y hacer esperar tres veces
 * al aviso mas frecuente seria peor—, una respuesta malformada tampoco, y repetir una
 * escritura es justo como se acaba con dos notas para el mismo error.
 */
export function withRetry(transport: Transport, options: RetryOptions = {}): Transport {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 500;
  const sleep = options.sleep ?? wait;
  return async (body, signal) => {
    for (let attempt = 1; ; attempt += 1) {
      signal?.throwIfAborted();
      try {
        return await transport(body, signal);
      } catch (error) {
        signal?.throwIfAborted();
        const retryable = error instanceof AnkiError && error.code === 'ANKI_LENTO' && isReadRequest(body);
        if (!retryable || attempt >= attempts) throw error;
        await sleep(delayMs * 2 ** (attempt - 1));
      }
    }
  };
}

export function unwrap(response: unknown): unknown {
  if (response === null || typeof response !== 'object'
    || !('result' in response) || !('error' in response)) {
    throw new AnkiError('ANKI_RESPUESTA_RARA', 'Respuesta incompleta de AnkiConnect. No se ha guardado.');
  }
  // Se cita como ajeno: es el texto de AnkiConnect, no un mensaje escrito para esta app.
  if (typeof response.error === 'string') throw new AnkiError('ANKI_ERROR', `AnkiConnect responde: ${response.error}`);
  if (response.error !== null) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Error de AnkiConnect con formato desconocido.');
  return response.result;
}

export function ankiMessage(error: unknown): string {
  return error instanceof AnkiError ? error.message : 'No se pudo completar la operación. Vuelve a intentarlo; se comprobará si la nota ya existe.';
}
