import { style } from '@vanilla-extract/css';

/*
 * The composer and the "is following" bar below it sit at the physical
 * bottom edge of the room view. `env(safe-area-inset-bottom)` resolves to 0
 * outside the iOS WKWebView shell, so this is safe to apply unconditionally
 * rather than branching on platform: it keeps them clear of the home
 * indicator there, and is inert everywhere else.
 */
export const RoomViewBottomBar = style({
  paddingBottom: 'env(safe-area-inset-bottom)',
});
