import React, { ChangeEventHandler, useCallback, useState } from 'react';
import { Box, Scroll, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifSearchResult[]>();
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(
    async (term: string) => {
      if (!term) {
        setResults(undefined);
        return;
      }
      setLoading(true);
      const found = await searchGifs(mx, term);
      setLoading(false);
      setResults(found);
    },
    [mx]
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
    { wait: 200 }
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
          {query && !loading && results?.length === 0 && (
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
