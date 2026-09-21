import { style } from '@vanilla-extract/css';
import { config } from 'folds';

/*
 * `env(safe-area-inset-top)` resolves to 0 outside the iOS WKWebView shell,
 * so this is safe to apply unconditionally rather than branching on
 * platform. It keeps the room header clear of the notch / Dynamic Island
 * once `viewport-fit=cover` lets the page draw under it.
 */
export const HeaderRoot = style({
  paddingTop: 'env(safe-area-inset-top)',
});

export const HeaderTopic = style({
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});
