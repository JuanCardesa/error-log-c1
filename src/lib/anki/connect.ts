import type { AnkiConfig } from './config';

export type AnkiErrorCode = 'ANKI_CERRADO' | 'ANKI_ERROR' | 'ANKI_RESPUESTA_RARA' | 'ANKI_CONFIG';
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
export type Transport = (body: AnkiRequest) => Promise<unknown>;

export function httpTransport(config: AnkiConfig, fetcher: typeof fetch = globalThis.fetch): Transport {
  return async (body) => {
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
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new AnkiError('ANKI_CERRADO', 'No se puede conectar. Abre Anki con AnkiConnect instalado y vuelve a intentarlo.');
    }
    if (!response.ok) throw new AnkiError('ANKI_ERROR', `AnkiConnect respondió con HTTP ${String(response.status)}.`);
    try { return await response.json() as unknown; }
    catch { throw new AnkiError('ANKI_RESPUESTA_RARA', 'AnkiConnect no devolvió JSON válido.'); }
  };
}

export function unwrap(response: unknown): unknown {
  if (response === null || typeof response !== 'object'
    || !('result' in response) || !('error' in response)) {
    throw new AnkiError('ANKI_RESPUESTA_RARA', 'Respuesta incompleta de AnkiConnect. No se ha guardado.');
  }
  if (typeof response.error === 'string') throw new AnkiError('ANKI_ERROR', response.error);
  if (response.error !== null) throw new AnkiError('ANKI_RESPUESTA_RARA', 'Error de AnkiConnect con formato desconocido.');
  return response.result;
}

export function ankiMessage(error: unknown): string {
  return error instanceof AnkiError ? error.message : 'No se pudo completar la operación. Vuelve a intentarlo; se comprobará si la nota ya existe.';
}
