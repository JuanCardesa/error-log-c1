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
