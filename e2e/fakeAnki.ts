import { createServer, type IncomingMessage, type Server } from 'node:http';

import type { AnkiRequest } from '../src/lib/anki/connect';
import { FakeAnki, card, note, review } from '../src/lib/anki/fixtures/build';

/**
 * AnkiConnect de mentira, servido por HTTP para los e2e.
 *
 * Es el mismo `FakeAnki` que valida los tests unitarios: un solo doble del contrato, de
 * modo que arreglarlo en un sitio lo arregla en los dos. Aqui solo se le pone encima el
 * sobre HTTP y un mando para provocar fallos desde el navegador.
 */

export const FAKE_ANKI_PORT = 8769;
export const FAKE_ANKI_URL = `http://127.0.0.1:${String(FAKE_ANKI_PORT)}`;
export const FAKE_ANKI_PROFILE = 'Coleccion de pruebas';
export const FAKE_SOURCE_DECK = 'English B2 to C1 Practice';

const DAY_MS = 86_400_000;

/**
 * Datos con fechas relativas a hoy: las consultas miran ventanas de dias civiles, asi
 * que un fixture con fechas fijas dejaria de aparecer al pasar el tiempo.
 */
export function fakeCollection(now = Date.now()): FakeAnki {
  const fake = new FakeAnki();
  fake.profile = FAKE_ANKI_PROFILE;
  fake.decks = [FAKE_SOURCE_DECK, `${FAKE_SOURCE_DECK}::Vocabulary`, `${FAKE_SOURCE_DECK}::Error Log`];
  fake.cards = [
    card({ cardId: 10, note: 20 }),
    card({ cardId: 11, note: 21, deckName: `${FAKE_SOURCE_DECK}::Vocabulary` }),
    card({ cardId: 12, note: 22, deckName: `${FAKE_SOURCE_DECK}::Error Log` }),
  ];
  fake.notes = new Map([
    [20, note({ noteId: 20, cards: [10], tags: ['cat::phrasal_verb'], fields: { Front: { value: 'deal with', order: 0 } } })],
    [21, note({ noteId: 21, cards: [11], tags: ['cat::collocation'], fields: { Front: { value: 'make an effort', order: 0 } } })],
    [22, note({ noteId: 22, cards: [12], tags: ['cat::noun_preposition'], fields: { Front: { value: 'reason for', order: 0 } } })],
  ]);
  // Dos fallos y dos aciertos en dias distintos de la ventana corta. Los dos fallos son
  // de clase distinta a proposito: uno es un lapso (tipo 1, carta ya aprendida) y el otro
  // un «Again» de los pasos de aprendizaje (tipo 0), que no es lo mismo.
  fake.reviews = {
    '10': [review({ id: now - DAY_MS, ease: 1, type: 1 }), review({ id: now - 2 * DAY_MS, ease: 3, type: 1 })],
    '11': [review({ id: now - 3 * DAY_MS, ease: 1, type: 0 })],
    '12': [review({ id: now - 4 * DAY_MS, ease: 3, type: 1 })],
  };
  return fake;
}

/** El mando del doble: deja provocar un fallo concreto y volver a la normalidad. */
interface Control {
  readonly failAction?: string | null;
  readonly disconnected?: boolean;
  /**
   * Repasos para una carta concreta, incluidas las que el propio test acaba de crear.
   * Sin esto no hay forma de que una nota vinculada al log tenga historial: las tres
   * notas del doble no llevan `ErrorLogId`, y las creadas nacen sin repasos.
   */
  readonly reviewsFor?: { readonly cardId: number; readonly ease: number; readonly type: number };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { reject(error instanceof Error ? error : new Error('cuerpo ilegible')); }
    });
    request.on('error', reject);
  });
}

export function startFakeAnki(fake: FakeAnki = fakeCollection(), port = FAKE_ANKI_PORT): Promise<Server> {
  const server = createServer((request, response) => {
    void (async () => {
      const send = (status: number, body: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      // Anki cerrado no responde un sobre ni tarda: rechaza la conexion. Cortar el socket
      // antes de leer nada da el mismo ECONNRESET, y no un timeout, que es otro aviso.
      if (fake.disconnected && request.url !== '/__control') {
        request.socket.destroy();
        return;
      }
      try {
        const body = await readJson(request);
        if (request.url === '/__control') {
          const control = body as Control;
          if (control.failAction !== undefined) fake.failAction = control.failAction;
          if (control.disconnected !== undefined) fake.disconnected = control.disconnected;
          if (control.reviewsFor !== undefined) {
            const { cardId, ease, type } = control.reviewsFor;
            fake.reviews = { ...fake.reviews, [String(cardId)]: [review({ id: Date.now() - DAY_MS, ease, type })] };
          }
          send(200, { ok: true });
          return;
        }
        send(200, await fake.transport(body as AnkiRequest));
      } catch (error) {
        send(500, { result: null, error: error instanceof Error ? error.message : 'fallo del doble' });
      }
    })();
  });
  return new Promise((resolve) => { server.listen(port, '127.0.0.1', () => { resolve(server); }); });
}
