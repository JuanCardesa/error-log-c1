import { expect, it } from 'vitest';
import { ankiConfig } from './config';
import { AnkiError } from './connect';

it.each([
  ['ANKI_SOURCE_DECK', 256], ['ANKI_TARGET_DECK', 256], ['ANKI_CONNECT_API_KEY', 1024],
] as const)('%s acepta su límite y rechaza excesos, vacíos y controles', (name, max) => {
  const env = { ANKI_TARGET_DECK: 'Destino', [name]: 'a'.repeat(max) };
  expect(() => ankiConfig(env)).not.toThrow();
  for (const value of ['', '   ', 'a'.repeat(max + 1), 'a'.repeat(100_000), 'a\nb', '\tvalor', 'valor\r', 'a\0b', 'a\u007fb', 'a\u0085b']) {
    expect(() => ankiConfig({ ...env, [name]: value })).toThrow(name);
    expect(() => ankiConfig({ ...env, [name]: value })).toThrow(AnkiError);
  }
});

it('valida también el destino derivado y conserva exactamente una clave válida', () => {
  expect(() => ankiConfig({ ANKI_SOURCE_DECK: 'a'.repeat(245) })).not.toThrow();
  expect(() => ankiConfig({ ANKI_SOURCE_DECK: 'a'.repeat(246) })).toThrow('ANKI_TARGET_DECK');
  expect(ankiConfig({ ANKI_SOURCE_DECK: '  Inglés::C1  ', ANKI_CONNECT_API_KEY: ' clave ' }))
    .toMatchObject({ sourceDeck: 'Inglés::C1', targetDeck: 'Inglés::C1::Error Log', apiKey: ' clave ' });
  expect(ankiConfig({}).apiKey).toBeUndefined();
});

it.each([
  '', '   ', 'no es una URL', 'http://', 'http://localhost:0', 'http://localhost:-1',
  'http://localhost:65536', 'http://localhost:abc', 'http://local\nhost:8765',
  'http://localhost:8765/\u007f',
])('envuelve una URL inválida en un error de configuración: %s', (url) => {
  expect(() => ankiConfig({ ANKI_CONNECT_URL: url })).toThrow('ANKI_CONNECT_URL');
  expect(() => ankiConfig({ ANKI_CONNECT_URL: url })).toThrow(AnkiError);
});

it('limita la URL original y normalizada a 2048 caracteres', () => {
  const prefix = 'http://127.0.0.1:8765/';
  expect(ankiConfig({ ANKI_CONNECT_URL: prefix + 'a'.repeat(2048 - prefix.length) }).url).toHaveLength(2048);
  expect(() => ankiConfig({ ANKI_CONNECT_URL: prefix + 'a'.repeat(2049 - prefix.length) })).toThrow('ANKI_CONNECT_URL');
  expect(() => ankiConfig({ ANKI_CONNECT_URL: prefix + 'é'.repeat(500) })).toThrow('ANKI_CONNECT_URL');
});

it.each(['http://localhost:1', 'https://localhost:65535', 'http://[::1]:8765', 'http://localhost', 'https://localhost'])('acepta un puerto local válido: %s', (url) => {
  expect(ankiConfig({ ANKI_CONNECT_URL: url }).url).toBe(new URL(url).href);
});

it('la grabación solo habla con Anki si lo pide con su URL y un perfil con nombre', () => {
  const recording = { ERRORLOG_DEMO: '1', ERRORLOG_RECORDING: '1' };
  expect(ankiConfig(recording)).toMatchObject({ disabled: true });
  expect(ankiConfig(recording).requiredProfile).toBeUndefined();
  // ANKI_CONNECT_URL no basta: la demo sigue sin tocar ninguna colección.
  expect(ankiConfig({ ...recording, ANKI_CONNECT_URL: 'http://127.0.0.1:8765' })).toMatchObject({ disabled: true });
  const env = { ...recording, ERRORLOG_RECORDING_ANKI_URL: 'http://127.0.0.1:8765', ERRORLOG_RECORDING_ANKI_PROFILE: ' Error Log demo ' };
  expect(ankiConfig(env)).toMatchObject({ disabled: false, url: 'http://127.0.0.1:8765/', requiredProfile: 'Error Log demo', statusTtlMs: 0 });
  expect(() => ankiConfig({ ...env, ERRORLOG_RECORDING_ANKI_PROFILE: undefined })).toThrow('ERRORLOG_RECORDING_ANKI_PROFILE');
  expect(() => ankiConfig({ ...env, ERRORLOG_RECORDING_ANKI_URL: 'http://192.168.1.2:8765' })).toThrow(AnkiError);
  // Fuera de la grabación, o sin demo, la variable no hace nada.
  expect(ankiConfig({ ...env, ERRORLOG_RECORDING: undefined })).toMatchObject({ disabled: true });
  expect(ankiConfig({ ...env, ERRORLOG_DEMO: undefined }).requiredProfile).toBeUndefined();
});
