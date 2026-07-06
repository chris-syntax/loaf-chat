import { MatrixClient } from 'matrix-js-sdk';

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

export const searchGifs = async (mx: MatrixClient, query: string): Promise<GifSearchResult[]> => {
  const token = await getCachedOpenIdToken(mx);
  if (!token) return [];

  const url = new URL(GIF_BRIDGE_SEARCH_PATH, window.location.origin);
  url.searchParams.set('q', query);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  return (await res.json()) as GifSearchResult[];
};
