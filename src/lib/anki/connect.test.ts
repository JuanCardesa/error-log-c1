import { describe, expect, it, vi } from 'vitest';
import { ankiConfig } from './config';
import { AnkiError, ankiMessage, httpTransport, unwrap } from './connect';
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
  it.each(['ftp://localhost', 'http://example.com', 'http://user:pass@localhost', 'http://localhost?key=1', 'http://localhost#x'])('rechaza destinos no locales o ambiguos (%s)', (url) => {
    expect(() => ankiConfig({ ANKI_CONNECT_URL: url })).toThrow();
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
