/**
 * Makes the app compress to fit the on-screen keyboard instead of sliding
 * out from under the status bar, inside the iOS WKWebView shell.
 *
 * Measured behaviour on iOS 26 (see the keyboard-up numbers in
 * docs/superpowers/specs/2026-09-20-ios-client-design.md): when the keyboard
 * opens, WKWebView shrinks `window.innerHeight` from 874 to 471 -- but
 * `document.documentElement.clientHeight` stays 874. So `height: 100%` still
 * resolves against the full screen, the document stays taller than the
 * visible area, and WebKit reveals the focused input by *scrolling the whole
 * page* (`scrollY` and `visualViewport.offsetTop` both become 403). The room
 * header scrolls up behind the Dynamic Island, which is not what should
 * happen -- the timeline should get shorter and the header should stay put.
 *
 * The fix is to publish the visual viewport's height as a custom property
 * and lay the app out against that, so the document is never taller than
 * what is visible and there is nothing for WebKit to scroll. The scroll
 * reset handles the frame where WebKit has already scrolled before the
 * resize is applied.
 *
 * Note this replaced an earlier translate-the-composer approach, which was
 * built on the assumption that WKWebView does *not* resize the layout
 * viewport. The measurements above show it does, so that code computed a
 * zero offset every time and did nothing.
 */

export type ViewportLike = {
  height: number;
  addEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
  removeEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
};

export type StyleTarget = {
  setProperty: (property: string, value: string) => void;
  removeProperty: (property: string) => void;
};

export const VIEWPORT_HEIGHT_PROPERTY = '--loaf-viewport-height';

/**
 * Overrides `env(safe-area-inset-bottom)` while the keyboard is up.
 *
 * The inset exists to clear the home indicator. Once the app is laid out
 * against the visual viewport, the bottom edge is the top of the keyboard
 * rather than the bottom of the screen whenever the keyboard is showing --
 * the home indicator is covered, and the inset becomes a strip of dead space
 * between the composer and the keyboard. Measured at 34px, and it does not
 * shrink on its own: `env(safe-area-inset-bottom)` still reports 34 with the
 * keyboard open.
 */
export const SAFE_BOTTOM_PROPERTY = '--loaf-safe-bottom';

/**
 * The keyboard cannot be detected by comparing `innerHeight` to
 * `visualViewport.height` -- measurement shows WKWebView shrinks both
 * together (874/874 closed, 471/471 open), so they are always equal. What
 * does distinguish the two is that the viewport is smaller than it has ever
 * been at rest, so the tallest height seen stands in for the screen.
 *
 * The threshold absorbs the small changes that are not the keyboard (an
 * accessory bar appearing on its own moves it by tens of pixels, and that
 * should still count as covered).
 */
const KEYBOARD_THRESHOLD_PX = 8;

/**
 * Wires `style` to carry the visual viewport's height, and undoes the scroll
 * WebKit applies when the keyboard opens. Returns a cleanup function.
 *
 * `resetScroll` is injectable so this can be unit tested without a window.
 */
export const observeViewportHeight = (
  style: StyleTarget,
  viewport: ViewportLike,
  resetScroll: () => void = () => window.scrollTo(0, 0)
): (() => void) => {
  let tallestSeen = viewport.height;

  const apply = () => {
    tallestSeen = Math.max(tallestSeen, viewport.height);
    style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${viewport.height}px`);

    if (viewport.height < tallestSeen - KEYBOARD_THRESHOLD_PX) {
      style.setProperty(SAFE_BOTTOM_PROPERTY, '0px');
    } else {
      // Removed rather than set, so the CSS falls back to env() and the
      // inset is owned in one place.
      style.removeProperty(SAFE_BOTTOM_PROPERTY);
    }

    resetScroll();
  };

  apply();
  viewport.addEventListener('resize', apply);
  viewport.addEventListener('scroll', apply);

  return () => {
    viewport.removeEventListener('resize', apply);
    viewport.removeEventListener('scroll', apply);
    style.removeProperty(VIEWPORT_HEIGHT_PROPERTY);
    style.removeProperty(SAFE_BOTTOM_PROPERTY);
  };
};
