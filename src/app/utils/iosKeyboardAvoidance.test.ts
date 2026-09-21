import { describe, expect, it, vi } from 'vitest';
import {
  VisualViewportLike,
  getKeyboardAvoidanceOffset,
  observeKeyboardAvoidance,
} from './iosKeyboardAvoidance';

describe('getKeyboardAvoidanceOffset', () => {
  it('is zero when the visual viewport fills the layout viewport', () => {
    expect(getKeyboardAvoidanceOffset(844, { height: 844, offsetTop: 0 })).toBe(0);
  });

  it('is the shrink amount when the keyboard shrinks the visual viewport', () => {
    // Keyboard takes 300px; visual viewport is not scrolled.
    expect(getKeyboardAvoidanceOffset(844, { height: 544, offsetTop: 0 })).toBe(300);
  });

  it('accounts for the visual viewport also being scrolled down', () => {
    // WebKit both shrinks and scrolls the visual viewport to keep the
    // focused input on screen; both must be subtracted from the layout
    // height to find how far the composer needs to travel.
    expect(getKeyboardAvoidanceOffset(844, { height: 544, offsetTop: 40 })).toBe(260);
  });

  it('never goes negative', () => {
    expect(getKeyboardAvoidanceOffset(844, { height: 900, offsetTop: 0 })).toBe(0);
  });
});

const makeVisualViewport = (
  height: number,
  offsetTop = 0
): VisualViewportLike & {
  fire: (type: 'resize' | 'scroll') => void;
} => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    height,
    offsetTop,
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    fire: (type) => {
      listeners.get(type)?.forEach((listener) => listener());
    },
  };
};

describe('observeKeyboardAvoidance', () => {
  it('applies the offset immediately on attach', () => {
    const target = { style: { transform: '' } };
    const visualViewport = makeVisualViewport(544);

    observeKeyboardAvoidance(target, visualViewport, () => 844);

    expect(target.style.transform).toBe('translateY(-300px)');
  });

  it('re-applies the offset on resize and scroll', () => {
    const target = { style: { transform: '' } };
    const visualViewport = makeVisualViewport(844);

    observeKeyboardAvoidance(target, visualViewport, () => 844);
    expect(target.style.transform).toBe('');

    visualViewport.height = 544;
    visualViewport.fire('resize');
    expect(target.style.transform).toBe('translateY(-300px)');

    visualViewport.offsetTop = 40;
    visualViewport.fire('scroll');
    expect(target.style.transform).toBe('translateY(-260px)');
  });

  it('clears the transform and detaches listeners on cleanup', () => {
    const target = { style: { transform: '' } };
    const visualViewport = makeVisualViewport(544);

    const cleanup = observeKeyboardAvoidance(target, visualViewport, () => 844);
    expect(target.style.transform).toBe('translateY(-300px)');

    cleanup();
    expect(target.style.transform).toBe('');

    // Further viewport events must not resurrect the transform.
    visualViewport.height = 400;
    visualViewport.fire('resize');
    expect(target.style.transform).toBe('');
  });

  it('does not touch window.innerHeight when a layout height getter is not supplied', () => {
    const originalWindow = global.window;
    vi.stubGlobal('window', { innerHeight: 844 });
    try {
      const target = { style: { transform: '' } };
      const visualViewport = makeVisualViewport(544);

      observeKeyboardAvoidance(target, visualViewport);

      expect(target.style.transform).toBe('translateY(-300px)');
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });
});
