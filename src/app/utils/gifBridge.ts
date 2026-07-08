import { MatrixClient } from 'matrix-js-sdk';
import { AutoDiscoveryInfo } from '../cs-api';

// The gif-bridge is reverse-proxied same-origin (see gitops traefik branch), so
// plain relative paths avoid CORS entirely.
const GIF_BRIDGE_SEARCH_PATH = '/api/gif/search';

// Matrix OpenID tokens are cheap to mint but short-lived — reuse one across many
// searches instead of getting a fresh one per keystroke. Only /search is gated;
// /media/:id is unauthenticated (see gif-bridge's own comment on that handler),
// so there's nothing for the client to attach a token to there.
let cachedToken: { token: string; expiresAt: number } | undefined;
const TOKEN_EXPIRY_MARGIN_MS = 15_000;

const getCachedOpenIdToken = async (mx: MatrixClient): Promise<string | undefined> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  try {
    const { access_token: token, expires_in: expiresIn } = await mx.getOpenIdToken();
    if (!token) return undefined;
    cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 - TOKEN_EXPIRY_MARGIN_MS };
    return token;
  } catch {
    return undefined;
  }
};

export type GifSearchResult = {
  id: string;
  width?: number;
  height?: number;
  mimetype?: string;
  size?: number;
  title: string;
  thumbUrl: string;
  fullUrl: string;
  pageUrl: string;
};

export const resolveBridgeUrl = (urlStr: string, info?: AutoDiscoveryInfo): string => {
  const customUrl = info?.['moe.loaf.gif']?.api_url;
  const baseUrl = customUrl || window.location.origin;
  try {
    return new URL(urlStr, baseUrl).toString();
  } catch {
    return urlStr;
  }
};

/**
 * Throws on any failure (no token, HTTP error, network/parse error) so the UI
 * can tell "the bridge is broken" apart from "no gifs matched" — an empty
 * array here always means a genuinely empty result set. Pass an AbortSignal
 * to cancel superseded searches; aborts surface as DOMException AbortError.
 */
export const searchGifs = async (
  mx: MatrixClient,
  query: string,
  info?: AutoDiscoveryInfo,
  signal?: AbortSignal
): Promise<GifSearchResult[]> => {
  const token = await getCachedOpenIdToken(mx);
  if (!token) throw new Error('GIF search: could not obtain an OpenID token.');

  const searchEndpoint = resolveBridgeUrl(GIF_BRIDGE_SEARCH_PATH, info);
  const url = new URL(searchEndpoint);
  url.searchParams.set('q', query);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) throw new Error(`GIF search failed with status ${res.status}.`);

  const results = (await res.json()) as GifSearchResult[];
  return results.map((gif) => ({
    ...gif,
    thumbUrl: resolveBridgeUrl(gif.thumbUrl, info),
    fullUrl: resolveBridgeUrl(gif.fullUrl, info),
  }));
};
