import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBridgeUrl } from './gifBridge';
import { AutoDiscoveryInfo } from '../cs-api';

const ORIGIN = 'https://chat.loaf.moe';

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
