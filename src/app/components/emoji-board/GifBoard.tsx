import React, { ChangeEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Scroll, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAutoDiscoveryInfo } from '../../hooks/useAutoDiscoveryInfo';
import { useDebounce } from '../../hooks/useDebounce';
import { preventScrollWithArrowKey } from '../../utils/keyboard';
import { GifSearchResult, searchGifs } from '../../utils/gifBridge';
import { SearchInput, GifItem } from './components';

type GifBoardProps = {
  onGifSelect?: (gif: GifSearchResult) => void;
  requestClose: () => void;
};
export function GifBoard({ onGifSelect, requestClose }: GifBoardProps) {
  const mx = useMatrixClient();
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifSearchResult[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Searches resolve out of order under fast typing; only the latest
  // request may touch state, and its predecessor is actively aborted.
  const abortRef = useRef<AbortController>();

  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = useCallback(
    async (term: string) => {
      abortRef.current?.abort();
      if (!term) {
        setResults(undefined);
        setLoading(false);
        setError(false);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(false);
      try {
        const found = await searchGifs(mx, term, autoDiscoveryInfo, controller.signal);
        if (controller.signal.aborted) return;
        setResults(found);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setResults(undefined);
        setLoading(false);
        setError(true);
      }
    },
    [mx, autoDiscoveryInfo]
  );

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback(
      (evt) => {
        const term = evt.target.value;
        setQuery(term);
        runSearch(term);
      },
      [runSearch]
    ),
    // Every distinct prefix that fires is a Giphy API call server-side, so
    // wait for a natural typing pause rather than racing the keystrokes.
    { wait: 300 }
  );

  const handleSelect = (gif: GifSearchResult) => {
    onGifSelect?.(gif);
    requestClose();
  };

  return (
    <Box direction="Column" grow="Yes" gap="200">
      <SearchInput query={query} onChange={handleOnChange} />
      <Scroll size="400" onKeyDown={preventScrollWithArrowKey} hideTrack>
        <Box wrap="Wrap" gap="100" style={{ padding: '8px' }}>
          {!query && (
            <Text size="T300" style={{ padding: '8px' }}>
              Search for a GIF
            </Text>
          )}
          {query && loading && (
            <Text size="T300" style={{ padding: '8px' }}>
              Searching…
            </Text>
          )}
          {query && !loading && error && (
            <Text size="T300" style={{ padding: '8px' }}>
              GIF search is unavailable right now. Try again in a moment.
            </Text>
          )}
          {query && !loading && !error && results?.length === 0 && (
            <Text size="T300" style={{ padding: '8px' }}>
              No Results found
            </Text>
          )}
          {results?.map((gif) => (
            <GifItem key={gif.id} gif={gif} onSelect={handleSelect} />
          ))}
        </Box>
      </Scroll>
    </Box>
  );
}
