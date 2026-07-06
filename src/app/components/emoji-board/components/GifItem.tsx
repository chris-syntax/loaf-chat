import React from 'react';
import { Box } from 'folds';
import * as css from './styles.css';
import { GifSearchResult } from '../../../utils/gifBridge';

type GifItemProps = {
  gif: GifSearchResult;
  onSelect: (gif: GifSearchResult) => void;
};
export function GifItem({ gif, onSelect }: GifItemProps) {
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
      <img loading="lazy" className={css.StickerImg} alt={gif.title} src={gif.thumbUrl} />
    </Box>
  );
}
