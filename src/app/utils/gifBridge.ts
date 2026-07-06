import { MatrixClient } from 'matrix-js-sdk';

// The gif-bridge is reverse-proxied same-origin (see gitops traefik branch), so
// plain relative paths avoid CORS entirely.
const GIF_BRIDGE_SEARCH_PATH = '/api/gif/search';

export const appendOpenIdToken = async (
  mx: MatrixClient,
  url: string
): Promise<string | undefined> => {
  try {
    const { access_token: token } = await mx.getOpenIdToken();
    if (!token) return undefined;
    const withToken = new URL(url, window.location.origin);
    withToken.searchParams.set('openid_token', token);
    return withToken.toString();
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
  const searchUrl = await appendOpenIdToken(
    mx,
    `${GIF_BRIDGE_SEARCH_PATH}?q=${encodeURIComponent(query)}`
  );
  if (!searchUrl) return [];
  const res = await fetch(searchUrl);
  if (!res.ok) return [];
  return (await res.json()) as GifSearchResult[];
};
