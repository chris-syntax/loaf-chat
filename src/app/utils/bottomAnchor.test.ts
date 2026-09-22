import { describe, expect, it } from 'vitest';
import { AnchorTarget, bottomAnchoredScrollTop, createBottomAnchor } from './bottomAnchor';

// A scroll container that clamps scrollTop the way a browser does.
const fakeScroller = (scrollHeight: number, clientHeight: number, scrollTop: number) => {
  let listener: (() => void) | undefined;
  let top = scrollTop;
  const el = {
    scrollHeight,
    clientHeight,
    get scrollTop() {
      return top;
    },
    set scrollTop(value: number) {
      top = Math.max(0, Math.min(value, el.scrollHeight - el.clientHeight));
    },
    addEventListener: (_type: 'scroll', l: () => void) => {
      listener = l;
    },
    removeEventListener: () => {
      listener = undefined;
    },
  };
  const userScroll = (value: number) => {
    el.scrollTop = value;
    listener?.();
  };
  return {
    el: el as AnchorTarget & { scrollHeight: number },
    userScroll,
    hasListener: () => !!listener,
  };
};

describe('bottomAnchoredScrollTop', () => {
  it('moves scrollTop down by exactly the height lost', () => {
    expect(bottomAnchoredScrollTop(1000, 700, 300)).toBe(1400);
  });

  it('moves scrollTop up by exactly the height gained', () => {
    expect(bottomAnchoredScrollTop(1400, 300, 700)).toBe(1000);
  });
});

describe('createBottomAnchor', () => {
  it('keeps the message above the composer in view when the keyboard opens', () => {
    // 5000px of history, 700px visible, scrolled up to reply to something.
    const { el } = fakeScroller(5000, 700, 2000);
    const anchor = createBottomAnchor(el);
    const bottomBefore = el.scrollTop + el.clientHeight;

    el.clientHeight = 300; // keyboard up
    anchor.onResize();

    expect(el.scrollTop + el.clientHeight).toBe(bottomBefore);
  });

  it('restores the same view when the keyboard closes', () => {
    const { el } = fakeScroller(5000, 700, 2000);
    const anchor = createBottomAnchor(el);

    el.clientHeight = 300;
    anchor.onResize();
    el.clientHeight = 700;
    anchor.onResize();

    expect(el.scrollTop).toBe(2000);
  });

  it('does not double-count growth the browser already clamped', () => {
    // At the very bottom with the keyboard up: growing the container clamps
    // scrollTop before the resize is observed.
    const { el } = fakeScroller(5000, 300, 4700);
    const anchor = createBottomAnchor(el);

    el.clientHeight = 700;
    const beforeClamp = el.scrollTop;
    el.scrollTop = beforeClamp; // the clamp, with no scroll event yet
    anchor.onResize();

    expect(el.scrollTop).toBe(4300);
    expect(el.scrollTop + el.clientHeight).toBe(5000);
  });

  it('follows the position the user scrolled to', () => {
    const { el, userScroll } = fakeScroller(5000, 700, 2000);
    const anchor = createBottomAnchor(el);

    userScroll(800);
    el.clientHeight = 300;
    anchor.onResize();

    expect(el.scrollTop).toBe(1200);
  });

  it('ignores resize notifications where the height did not change', () => {
    const { el } = fakeScroller(5000, 700, 2000);
    const anchor = createBottomAnchor(el);

    anchor.onResize();

    expect(el.scrollTop).toBe(2000);
  });

  it('stops listening on dispose', () => {
    const { el, hasListener } = fakeScroller(5000, 700, 2000);
    const anchor = createBottomAnchor(el);
    expect(hasListener()).toBe(true);

    anchor.dispose();

    expect(hasListener()).toBe(false);
  });
});
