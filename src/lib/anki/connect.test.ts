import { describe, expect, it, vi } from 'vitest';
import { ankiConfig } from './config';
import { ANKI_TIMEOUT_MS, AnkiError, ankiMessage, httpTransport, timeoutFor, unwrap, withRetry, type AnkiRequest, type Transport } from './connect';
import { ankiApi, searchTerm } from './api';
import { FakeAnki, CONFIG } from './fixtures/build';

describe('configuración y transporte local', () => {
  it('usa valores locales y permite personalizar mazos y clave', () => {
    expect(ankiConfig({})).toEqual(CONFIG);
    expect(ankiConfig({ ANKI_SOURCE_DECK: 'Otro' }).targetDeck).toBe('Otro::Error Log');
    expect(ankiConfig({ ANKI_CONNECT_URL: 'http://localhost:8766', ANKI_TARGET_DECK: 'Destino', ANKI_CONNECT_API_KEY: 'secreto' })).toMatchObject({ targetDeck: 'Destino', apiKey: 'secreto' });
    expect(ankiConfig({ ERRORLOG_DEMO: '1' }).disabled).toBe(true);
    expect(ankiConfig({ ERRORLOG_E2E: '1' }).disabled).toBe(true);
  });
  describe('el doble de los e2e no puede alcanzar la colección personal', () => {
    const FAKE = 'http://127.0.0.1:8769/';
    it('habilita Anki solo con un doble inyectado, y solo en e2e', () => {
      expect(ankiConfig({ ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: FAKE }))
        .toMatchObject({ url: FAKE, disabled: false });
      // La demo no habla con Anki ni aunque le pasen un doble.
      expect(ankiConfig({ ERRORLOG_DEMO: '1', ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: FAKE }).disabled).toBe(true);
      expect(ankiConfig({ ERRORLOG_DEMO: '1', ERRORLOG_ANKI_FAKE_URL: FAKE }).disabled).toBe(true);
    });
    it('en e2e ignora ANKI_CONNECT_URL: el doble es el único destino posible', () => {
      expect(ankiConfig({ ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: FAKE, ANKI_CONNECT_URL: 'http://127.0.0.1:8765' }).url).toBe(FAKE);
    });
    it('fuera de los e2e el doble no existe: no puede desviar la app real', () => {
      expect(ankiConfig({ ERRORLOG_ANKI_FAKE_URL: FAKE })).toMatchObject({ url: 'http://127.0.0.1:8765/', disabled: false });
    });
    it.each(['http://127.0.0.1:8765', 'http://localhost'])('rechaza un doble en el puerto real (%s)', (url) => {
      expect(() => ankiConfig({ ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: url })).toThrow('8765');
    });
  });
  it.each(['ftp://localhost', 'http://example.com', 'http://user:pass@localhost', 'http://localhost?key=1', 'http://localhost#x'])('rechaza destinos no locales o ambiguos (%s)', (url) => {
    expect(() => ankiConfig({ ANKI_CONNECT_URL: url })).toThrow();
  });
  it('no guarda el estado de conexión en demo ni en pruebas: ahí se cambia a propósito', () => {
    expect(ankiConfig({}).statusTtlMs).toBeGreaterThan(0);
    expect(ankiConfig({ ERRORLOG_DEMO: '1' }).statusTtlMs).toBe(0);
    expect(ankiConfig({ ERRORLOG_E2E: '1' }).statusTtlMs).toBe(0);
    expect(ankiConfig({ ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: 'http://127.0.0.1:8769/' }).statusTtlMs).toBe(0);
  });
  it('permite declarar a mano el corte de día, que AnkiConnect no expone', () => {
    expect(ankiConfig({}).rolloverHour).toBeUndefined();
    expect(ankiConfig({ ANKI_ROLLOVER_HOUR: '' }).rolloverHour).toBeUndefined();
    expect(ankiConfig({ ANKI_ROLLOVER_HOUR: '0' }).rolloverHour).toBe(0);
    expect(ankiConfig({ ANKI_ROLLOVER_HOUR: '23' }).rolloverHour).toBe(23);
  });
  it.each(['24', '-1', '4.5', 'cuatro'])('rechaza un corte de día imposible (%s)', (hour) => {
    expect(() => ankiConfig({ ANKI_ROLLOVER_HOUR: hour })).toThrow('ANKI_ROLLOVER_HOUR');
  });
  it('envía versión, clave, no-store y timeout; no sigue redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 6, error: null }));
    const transport = httpTransport({ ...CONFIG, apiKey: 'secret' }, fetcher);
    expect(await ankiApi(transport).version()).toBe(6);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', redirect: 'error', method: 'POST', signal: expect.any(AbortSignal) });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ action: 'version', params: {}, version: 6, key: 'secret' });
  });
  it('clasifica fallo de conexión, HTTP y JSON sin depender de Anki', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = ankiApi(httpTransport(CONFIG, fetcher));
    fetcher.mockRejectedValueOnce(new Error('timeout'));
    await expect(api.version()).rejects.toMatchObject({ code: 'ANKI_CERRADO' });
    fetcher.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(api.version()).rejects.toMatchObject({ code: 'ANKI_ERROR' });
    fetcher.mockResolvedValueOnce(new Response('no es JSON'));
    await expect(api.version()).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
    await expect(ankiApi(httpTransport({ ...CONFIG, disabled: true }, fetcher)).version()).rejects.toMatchObject({ code: 'ANKI_CONFIG' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('incluye la clave también en las subacciones de multi', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: [], error: null }));
    await httpTransport({ ...CONFIG, apiKey: 'secret' }, fetcher)({ action: 'multi', version: 6, params: { actions: [{ action: 'version', version: 6, params: {} }] } });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).params.actions[0].key).toBe('secret');
  });
  it.each([null, 6, {}, { result: 6 }, { error: null }, { result: 6, error: 42 }])('no acepta sobres ambiguos (%j)', (value) => {
    expect(() => unwrap(value)).toThrow(AnkiError);
  });
  it('propaga errores de Anki sin confundirlos con Anki cerrado', () => {
    expect(() => unwrap({ result: null, error: 'unsupported action' })).toThrow('unsupported action');
    expect(ankiMessage(new AnkiError('ANKI_ERROR', 'mensaje'))).toBe('mensaje');
    expect(ankiMessage(new Error('privado'))).not.toContain('privado');
  });
  it('escapa nombres de mazo en búsquedas', () => {
    expect(searchTerm('deck', 'A"B\\C_*')).toBe('deck:"A\\"B\\\\C\\_\\*"');
  });
});

describe('plazos y reintentos', () => {
  const read = (action: string): AnkiRequest => ({ action, version: 6, params: {} });
  const multi = (...actions: string[]): AnkiRequest =>
    ({ action: 'multi', version: 6, params: { actions: actions.map(read) } });

  it('da a cada acción el plazo que le corresponde', () => {
    expect(timeoutFor('version')).toBe(ANKI_TIMEOUT_MS.quick);
    expect(timeoutFor('getActiveProfile')).toBe(ANKI_TIMEOUT_MS.quick);
    expect(timeoutFor('cardsInfo')).toBe(ANKI_TIMEOUT_MS.batch);
    expect(timeoutFor('multi')).toBe(ANKI_TIMEOUT_MS.batch);
    expect(timeoutFor('notesInfo')).toBe(ANKI_TIMEOUT_MS.batch);
    expect(timeoutFor('addNote')).toBe(ANKI_TIMEOUT_MS.write);
    // Una accion desconocida se trata como escritura: no se reintenta ni se apura.
    expect(timeoutFor('deleteNotes')).toBe(ANKI_TIMEOUT_MS.write);
  });

  it('un lote lento se manda con el plazo largo, no con el del saludo', async () => {
    // Un Response solo se lee una vez: cada llamada necesita el suyo.
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json({ result: [], error: null })));
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      await httpTransport(CONFIG, fetcher)(multi('cardsInfo'));
      await httpTransport(CONFIG, fetcher)(read('version'));
      expect(spy.mock.calls).toEqual([[ANKI_TIMEOUT_MS.batch], [ANKI_TIMEOUT_MS.quick]]);
    } finally { spy.mockRestore(); }
  });

  it('distingue expirar de no poder conectar', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockRejectedValueOnce(Object.assign(new Error('abortado'), { name: 'TimeoutError' }));
    await expect(httpTransport(CONFIG, fetcher)(read('version'))).rejects.toMatchObject({ code: 'ANKI_LENTO' });
    fetcher.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(httpTransport(CONFIG, fetcher)(read('version'))).rejects.toMatchObject({ code: 'ANKI_CERRADO' });
    // undici envuelve el abort en `cause`: sigue siendo haber expirado.
    fetcher.mockRejectedValueOnce(new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { name: 'TimeoutError' }) }));
    await expect(httpTransport(CONFIG, fetcher)(read('version'))).rejects.toMatchObject({ code: 'ANKI_LENTO' });
  });

  it('espera de verdad cuando no se le inyecta un reloj', async () => {
    const inner = vi.fn<Transport>()
      .mockRejectedValueOnce(new AnkiError('ANKI_LENTO', 'lento'))
      .mockResolvedValueOnce({ result: 6, error: null });
    expect(await withRetry(inner, { delayMs: 0 })(read('findCards'))).toEqual({ result: 6, error: null });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('reintenta una lectura que expiró y devuelve el resultado del segundo intento', async () => {
    const slept: number[] = [];
    const inner = vi.fn<Transport>()
      .mockRejectedValueOnce(new AnkiError('ANKI_LENTO', 'lento'))
      .mockResolvedValueOnce({ result: [1], error: null });
    const result = await withRetry(inner, { sleep: async (ms) => { slept.push(ms); } })(multi('cardsInfo'));
    expect(result).toEqual({ result: [1], error: null });
    expect(inner).toHaveBeenCalledTimes(2);
    expect(slept).toEqual([500]);
  });

  it('espera cada vez más y se rinde con el último error', async () => {
    const slept: number[] = [];
    const inner = vi.fn<Transport>().mockRejectedValue(new AnkiError('ANKI_LENTO', 'lento'));
    await expect(withRetry(inner, { sleep: async (ms) => { slept.push(ms); } })(read('notesInfo')))
      .rejects.toMatchObject({ code: 'ANKI_LENTO' });
    expect(inner).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([500, 1000]);
  });

  it.each([
    ['una escritura', read('addNote')],
    ['un multi con una escritura dentro', multi('cardsInfo', 'addNote')],
    ['un multi vacío', multi()],
  ])('no reintenta %s aunque expire', async (_label, body) => {
    const inner = vi.fn<Transport>().mockRejectedValue(new AnkiError('ANKI_LENTO', 'lento'));
    await expect(withRetry(inner, { sleep: async () => undefined })(body)).rejects.toThrow('lento');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it.each(['ANKI_CERRADO', 'ANKI_ERROR', 'ANKI_RESPUESTA_RARA', 'ANKI_CONFIG'] as const)(
    'no hace esperar al usuario cuando el fallo no mejora repitiéndolo (%s)', async (code) => {
      const inner = vi.fn<Transport>().mockRejectedValue(new AnkiError(code, 'fallo'));
      await expect(withRetry(inner, { sleep: async () => undefined })(read('notesInfo'))).rejects.toThrow('fallo');
      expect(inner).toHaveBeenCalledTimes(1);
    });
});

describe('validación del contrato AnkiConnect', () => {
  it('rechaza respuestas con tipos equivocados y versiones antiguas', async () => {
    await expect(ankiApi(async () => ({ result: 5, error: null })).version()).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
    await expect(ankiApi(async () => ({ result: '6', error: null })).version()).rejects.toThrow();
  });
  it('detecta notas que faltan, se han reordenado o están borradas', async () => {
    const fake = new FakeAnki();
    expect(await ankiApi(fake.transport).notesInfo([999])).toEqual([null]);
    fake.override = () => ({ result: [], error: null });
    await expect(ankiApi(fake.transport).notesInfo([20])).rejects.toThrow('Faltan notas');
    fake.override = () => ({ result: [{ ...fake.notes.get(20)!, noteId: 21 }], error: null });
    await expect(ankiApi(fake.transport).notesInfo([20])).rejects.toThrow('no coinciden');
    fake.override = () => ({ result: [[]], error: null });
    await expect(ankiApi(fake.transport).notesInfo([20])).rejects.toMatchObject({ code: 'ANKI_RESPUESTA_RARA' });
  });
  it.each(['card-count', 'card-order', 'review-count', 'review-id', 'nested-error'])('rechaza un snapshot parcial: %s', async (mode) => {
    const fake = new FakeAnki();
    fake.override = ({ action }) => {
      if (action === 'cardsInfo' && mode === 'card-count') return { result: [], error: null };
      if (action === 'cardsInfo' && mode === 'card-order') return { result: [{ ...fake.cards[0]!, cardId: 11 }], error: null };
      if (action === 'getReviewsOfCards' && mode === 'review-count') return { result: {}, error: null };
      if (action === 'getReviewsOfCards' && mode === 'review-id') return { result: { '11': [] }, error: null };
      if (action === 'getReviewsOfCards' && mode === 'nested-error') return { result: null, error: 'falló el repaso' };
    };
    await expect(ankiApi(fake.transport).cardSnapshot([10])).rejects.toThrow();
  });
});
