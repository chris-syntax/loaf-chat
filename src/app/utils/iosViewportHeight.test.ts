import { describe, expect, it, vi } from 'vitest';
import {
  observeViewportHeight,
  SAFE_BOTTOM_PROPERTY,
  StyleTarget,
  VIEWPORT_HEIGHT_PROPERTY,
  ViewportLike,
} from './iosViewportHeight';

const fakeStyle = () => {
  const props = new Map<string, string>();
  const style: StyleTarget = {
    setProperty: (property, value) => {
      props.set(property, value);
    },
    removeProperty: (property) => {
      props.delete(property);
    },
  };
  return { style, props };
};

const fakeViewport = (height: number) => {
  const listeners: Record<string, Array<() => void>> = { resize: [], scroll: [] };
  const viewport: ViewportLike & { height: number } = {
    height,
    addEventListener: (type, listener) => listeners[type].push(listener),
    removeEventListener: (type, listener) => {
      listeners[type] = listeners[type].filter((l) => l !== listener);
    },
  };
  const fire = (type: 'resize' | 'scroll') => listeners[type].forEach((l) => l());
  const listenerCount = () => listeners.resize.length + listeners.scroll.length;
  return { viewport, fire, listenerCount };
};

describe('observeViewportHeight', () => {
  it('publishes the viewport height immediately, without waiting for an event', () => {
    const { style, props } = fakeStyle();
    const { viewport } = fakeViewport(874);

    observeViewportHeight(style, viewport, vi.fn());

    expect(props.get(VIEWPORT_HEIGHT_PROPERTY)).toBe('874px');
  });

  it('shrinks the published height when the keyboard opens', () => {
    const { style, props } = fakeStyle();
    const { viewport, fire } = fakeViewport(874);

    observeViewportHeight(style, viewport, vi.fn());

    // The measured iOS 26 transition: 874 -> 471 when the keyboard appears.
    viewport.height = 471;
    fire('resize');

    expect(props.get(VIEWPORT_HEIGHT_PROPERTY)).toBe('471px');
  });

  it('undoes the scroll WebKit applies when revealing the focused input', () => {
    const { style } = fakeStyle();
    const { viewport, fire } = fakeViewport(874);
    const resetScroll = vi.fn();

    observeViewportHeight(style, viewport, resetScroll);
    expect(resetScroll).toHaveBeenCalledTimes(1);

    viewport.height = 471;
    fire('resize');
    expect(resetScroll).toHaveBeenCalledTimes(2);

    // WebKit scrolls without resizing too, which is the case that slid the
    // header up behind the Dynamic Island.
    fire('scroll');
    expect(resetScroll).toHaveBeenCalledTimes(3);
  });

  it('zeroes the bottom inset while the keyboard covers the home indicator', () => {
    const { style, props } = fakeStyle();
    const { viewport, fire } = fakeViewport(874);

    observeViewportHeight(style, viewport, vi.fn());
    // At rest the variable is absent, so CSS falls back to env().
    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);

    viewport.height = 471;
    fire('resize');
    expect(props.get(SAFE_BOTTOM_PROPERTY)).toBe('0px');

    // Dismissing restores the fallback rather than pinning it to a value.
    viewport.height = 874;
    fire('resize');
    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);
  });

  it('ignores viewport jitter too small to be a keyboard', () => {
    const { style, props } = fakeStyle();
    const { viewport, fire } = fakeViewport(874);

    observeViewportHeight(style, viewport, vi.fn());

    viewport.height = 870;
    fire('resize');

    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);
  });

  it('treats a viewport that starts short as the baseline, not a keyboard', () => {
    // If the observer starts while the keyboard is already up, the tallest
    // height seen is that short one -- it must not latch the inset to zero
    // forever once the keyboard goes away and the viewport grows.
    const { style, props } = fakeStyle();
    const { viewport, fire } = fakeViewport(471);

    observeViewportHeight(style, viewport, vi.fn());
    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);

    viewport.height = 874;
    fire('resize');
    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);

    viewport.height = 471;
    fire('resize');
    expect(props.get(SAFE_BOTTOM_PROPERTY)).toBe('0px');
  });

  it('detaches listeners and drops the property on cleanup', () => {
    const { style, props } = fakeStyle();
    const { viewport, fire, listenerCount } = fakeViewport(874);
    const resetScroll = vi.fn();

    const stop = observeViewportHeight(style, viewport, resetScroll);
    expect(listenerCount()).toBe(2);

    stop();

    expect(listenerCount()).toBe(0);
    expect(props.has(VIEWPORT_HEIGHT_PROPERTY)).toBe(false);
    expect(props.has(SAFE_BOTTOM_PROPERTY)).toBe(false);

    // Nothing should still be reacting after cleanup, or the property comes
    // back on a later keyboard event and web/desktop inherit a fixed height.
    viewport.height = 471;
    fire('resize');
    expect(resetScroll).toHaveBeenCalledTimes(1);
    expect(props.has(VIEWPORT_HEIGHT_PROPERTY)).toBe(false);
  });
});
