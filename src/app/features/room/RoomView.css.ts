import { style } from '@vanilla-extract/css';

/*
 * The composer and the "is following" bar below it sit at the bottom edge of
 * the room view, so they carry the home-indicator inset.
 *
 * --loaf-safe-bottom is published by the iOS shell only while the keyboard
 * is up, where it zeroes this: the layout already ends at the keyboard, so
 * the inset would be a strip of dead space rather than clearance. Everywhere
 * else the variable is unset and env() applies -- and env() is 0 wherever
 * there is no physical inset, so web and desktop are unaffected.
 * See src/app/utils/iosViewportHeight.ts.
 */
export const RoomViewBottomBar = style({
  paddingBottom: 'var(--loaf-safe-bottom, env(safe-area-inset-bottom))',
});
