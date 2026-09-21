/**
 * Keyboard avoidance for the message composer inside the iOS WKWebView
 * shell (see docs/superpowers/specs/2026-09-20-ios-client-design.md).
 *
 * WKWebView does not resize the layout viewport when the keyboard shows —
 * the page keeps believing it has the full window height. Instead WebKit
 * shrinks the *visual* viewport and scrolls it, so the focused input stays
 * on screen. An element pinned to the bottom of the layout viewport (our
 * composer) ends up below what is actually visible: hidden under the
 * keyboard, or stranded by the scroll. This is the specific WKWebView
 * behaviour that makes webview chat apps feel broken.
 *
 * The fix: track `window.visualViewport` and translate the composer up by
 * exactly the gap between the layout and visual viewports, so it stays
 * glued to the bottom edge of whatever is actually visible.
 */

export type VisualViewportLike = {
  height: number;
  offsetTop: number;
  addEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
  removeEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
};

export type KeyboardAvoidanceTarget = {
  style: { transform: string };
};

/** The pixel gap the target must be lifted by to clear the keyboard. */
export const getKeyboardAvoidanceOffset = (
  layoutViewportHeight: number,
  visualViewport: Pick<VisualViewportLike, 'height' | 'offsetTop'>
): number => Math.max(0, layoutViewportHeight - visualViewport.height - visualViewport.offsetTop);

/**
 * Wires `element` to stay above the on-screen keyboard by translating it up
 * whenever `visualViewport` resizes or scrolls. Returns a cleanup function
 * that detaches the listeners and resets the transform.
 *
 * `getLayoutViewportHeight` is injectable (defaults to `window.innerHeight`)
 * so this can be unit tested without a real DOM/window.
 */
export const observeKeyboardAvoidance = (
  element: KeyboardAvoidanceTarget,
  visualViewport: VisualViewportLike,
  getLayoutViewportHeight: () => number = () => window.innerHeight
): (() => void) => {
  // Destructured so we mutate a local binding, not `element`'s property
  // directly (no-param-reassign) - same underlying CSSStyleDeclaration.
  const { style } = element;

  const applyOffset = () => {
    const offset = getKeyboardAvoidanceOffset(getLayoutViewportHeight(), visualViewport);
    style.transform = offset > 0 ? `translateY(-${offset}px)` : '';
  };

  applyOffset();
  visualViewport.addEventListener('resize', applyOffset);
  visualViewport.addEventListener('scroll', applyOffset);

  return () => {
    visualViewport.removeEventListener('resize', applyOffset);
    visualViewport.removeEventListener('scroll', applyOffset);
    style.transform = '';
  };
};
