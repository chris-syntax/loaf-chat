import React from 'react';
import { Box, Spinner } from 'folds';
import * as css from './styles.css';
import { GifSearchResult } from '../../../utils/gifBridge';
import { useAuthedGifSrc } from '../../../hooks/useAuthedGifSrc';

type GifItemProps = {
  gif: GifSearchResult;
  onSelect: (gif: GifSearchResult) => void;
};
export function GifItem({ gif, onSelect }: GifItemProps) {
  const { src, failed } = useAuthedGifSrc(gif.thumbUrl);

  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.StickerItem}
      title={gif.title}
      aria-label={`${gif.title} gif`}
      onClick={() => onSelect(gif)}
    >
      {src && !failed ? (
        <img loading="lazy" className={css.StickerImg} alt={gif.title} src={src} />
      ) : (
        <Spinner size="100" />
      )}
    </Box>
  );
}
