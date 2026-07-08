import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBridgeUrl } from './gifBridge';
import { AutoDiscoveryInfo } from '../cs-api';

const ORIGIN = 'https://chat.loaf.moe';

type GifBridgeModule = typeof import('./gifBridge');
type FakeMatrixClient = Parameters<GifBridgeModule['searchGifs']>[0];

const infoWithApiUrl = (apiUrl: string): AutoDiscoveryInfo =>
  ({
    'm.homeserver': { base_url: 'https://matrix.loaf.moe' },
    'moe.loaf.gif': { api_url: apiUrl },
  } as AutoDiscoveryInfo);

describe('resolveBridgeUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves relative paths against the page origin by default', () => {
    expect(resolveBridgeUrl('/api/gif/media/abc123/full')).toBe(
      `${ORIGIN}/api/gif/media/abc123/full`
    );
  });

  it('resolves relative paths against a custom api_url when discovered', () => {
    expect(
      resolveBridgeUrl('/api/gif/media/abc123/thumb', infoWithApiUrl('https://gif.example.com'))
    ).toBe('https://gif.example.com/api/gif/media/abc123/thumb');
  });

  it('passes absolute urls through untouched', () => {
    expect(resolveBridgeUrl('https://old.example.com/api/gif/media/abc123', undefined)).toBe(
      'https://old.example.com/api/gif/media/abc123'
    );
  });

  it('returns the input unchanged when the base url is unparseable', () => {
    expect(resolveBridgeUrl('/api/gif/search', infoWithApiUrl('not a url'))).toBe(
      '/api/gif/search'
    );
  });
});

describe('searchGifs', () => {
  // The OpenID token cache is module state, so each test gets a fresh module
  // instance to keep token-related assertions independent.
  let gifBridge: GifBridgeModule;

  const mkMx = (): FakeMatrixClient =>
    ({
      getOpenIdToken: vi.fn(async () => ({ access_token: 'tok', expires_in: 3600 })),
    } as unknown as FakeMatrixClient);

  const bridgeResult = {
    id: 'abc123',
    title: 'Cat GIF',
    thumbUrl: '/api/gif/media/abc123/thumb',
    fullUrl: '/api/gif/media/abc123/full',
    pageUrl: 'https://giphy.com/gifs/abc123',
  };

  const okFetch = () => vi.fn(async () => ({ ok: true, json: async () => [bridgeResult] }));

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { origin: ORIGIN } });
    gifBridge = await import('./gifBridge');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token and maps result urls to absolute', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const results = await gifBridge.searchGifs(mkMx(), 'cat');

    expect(results).toHaveLength(1);
    expect(results[0].thumbUrl).toBe(`${ORIGIN}/api/gif/media/abc123/thumb`);
    expect(results[0].fullUrl).toBe(`${ORIGIN}/api/gif/media/abc123/full`);

    const [calledUrl, opts] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(calledUrl)).toBe(`${ORIGIN}/api/gif/search?q=cat`);
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('reuses one OpenID token across searches', async () => {
    vi.stubGlobal('fetch', okFetch());
    const mx = mkMx();

    await gifBridge.searchGifs(mx, 'cat');
    await gifBridge.searchGifs(mx, 'dog');

    expect(mx.getOpenIdToken).toHaveBeenCalledTimes(1);
  });

  it('throws when the bridge responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));

    await expect(gifBridge.searchGifs(mkMx(), 'cat')).rejects.toThrow('502');
  });

  it('throws when no OpenID token can be obtained', async () => {
    vi.stubGlobal('fetch', okFetch());
    const mx = {
      getOpenIdToken: vi.fn(async () => {
        throw new Error('homeserver unreachable');
      }),
    } as unknown as FakeMatrixClient;

    await expect(gifBridge.searchGifs(mx, 'cat')).rejects.toThrow('OpenID token');
  });

  it('passes the abort signal through to fetch', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await gifBridge.searchGifs(mkMx(), 'cat', undefined, controller.signal);

    const [, opts] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(opts.signal).toBe(controller.signal);
  });
});
