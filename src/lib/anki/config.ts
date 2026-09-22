export interface AnkiConfig {
  readonly url: string;
  readonly sourceDeck: string;
  readonly targetDeck: string;
  readonly apiKey?: string;
  readonly disabled: boolean;
}

/** Solo el servidor habla con el complemento local; nunca se envía la clave al cliente. */
export function ankiConfig(env: Readonly<Record<string, string | undefined>> = process.env): AnkiConfig {
  const url = new URL(env['ANKI_CONNECT_URL'] ?? 'http://127.0.0.1:8765');
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('ANKI_CONNECT_URL debe apuntar a AnkiConnect en este equipo.');
  }
  const sourceDeck = env['ANKI_SOURCE_DECK']?.trim() || 'English B2 to C1 Practice';
  return {
    url: url.href,
    sourceDeck,
    targetDeck: env['ANKI_TARGET_DECK']?.trim() || `${sourceDeck}::Error Log`,
    apiKey: env['ANKI_CONNECT_API_KEY'],
    // La demo y los e2e nunca leen ni escriben la colección personal.
    disabled: env['ERRORLOG_DEMO'] === '1' || env['ERRORLOG_E2E'] === '1',
  };
}
