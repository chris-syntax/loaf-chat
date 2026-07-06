import { useEffect, useState } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { appendOpenIdToken } from '../utils/gifBridge';

/**
 * Resolves a gif-bridge URL to a fetchable <img src>, appending a fresh Matrix
 * OpenID token on every mount. The bridge re-verifies that token on every request,
 * so every viewer re-authenticates independently each time an image renders.
 */
export const useAuthedGifSrc = (bridgeUrl?: string): { src?: string; failed: boolean } => {
  const mx = useMatrixClient();
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setSrc(undefined);
    setFailed(false);
    if (typeof bridgeUrl === 'string') {
      appendOpenIdToken(mx, bridgeUrl).then((resolved) => {
        if (disposed) return;
        if (resolved) setSrc(resolved);
        else setFailed(true);
      });
    }
    return () => {
      disposed = true;
    };
  }, [mx, bridgeUrl]);

  return { src, failed };
};
