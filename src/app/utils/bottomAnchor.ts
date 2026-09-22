/**
 * Keeps a scroll container's content fixed relative to its *bottom* edge
 * when the container itself changes height.
 *
 * Needed in the iOS shell because the keyboard shrinks the timeline from the
 * bottom: `scrollTop` is measured from the top and does not change, so the
 * lowest ~400px of what was on screen slides underneath the composer. In
 * practice that is the message you were about to reply to. Chat apps anchor
 * to the bottom instead -- the timeline gets shorter from the top.
 *
 * The existing resize handling in RoomTimeline only covers being scrolled
 * all the way down (it jumps to the bottom). This covers being scrolled up,
 * which is exactly the replying-to-an-older-message case.
 */

/**
 * Where scrollTop must go to keep the bottom edge on the same content.
 *
 * Measured from the last scrollTop the container *reported*, rather than the
 * current one, because growing the container can clamp scrollTop before the
 * resize is observed -- reading it then would double-count the growth. The
 * browser clamps the result into range, so no bounds handling is needed.
 */
export const bottomAnchoredScrollTop = (
  lastScrollTop: number,
  previousHeight: number,
  newHeight: number
): number => lastScrollTop + (previousHeight - newHeight);

export type AnchorTarget = {
  scrollTop: number;
  clientHeight: number;
  addEventListener: (type: 'scroll', listener: () => void, options?: { passive: boolean }) => void;
  removeEventListener: (type: 'scroll', listener: () => void) => void;
};

/**
 * Tracks `el`'s scroll position and returns a handler to call whenever its
 * height changes (from a ResizeObserver). Returns that handler and a cleanup
 * function.
 */
export const createBottomAnchor = (
  el: AnchorTarget
): { onResize: () => void; dispose: () => void } => {
  let lastScrollTop = el.scrollTop;
  let lastHeight = el.clientHeight;

  const onScroll = () => {
    lastScrollTop = el.scrollTop;
  };
  el.addEventListener('scroll', onScroll, { passive: true });

  const onResize = () => {
    const height = el.clientHeight;
    if (height === lastHeight) return;
    const target = bottomAnchoredScrollTop(lastScrollTop, lastHeight, height);
    lastHeight = height;
    // eslint-disable-next-line no-param-reassign
    el.scrollTop = target;
    // Recorded directly as well: the scroll event this triggers may arrive
    // after another resize, and it would then be read as stale.
    lastScrollTop = el.scrollTop;
  };

  return {
    onResize,
    dispose: () => el.removeEventListener('scroll', onScroll),
  };
};
