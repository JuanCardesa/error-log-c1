import { FAKE_ANKI_URL, startFakeAnki } from './fakeAnki';

const server = await startFakeAnki();
console.log(`Doble de AnkiConnect escuchando en ${FAKE_ANKI_URL}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { server.close(); process.exit(0); });
}
