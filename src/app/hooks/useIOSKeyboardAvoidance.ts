import { RefObject, useEffect } from 'react';
import { isIOSShell } from '../utils/iosShell';
import { observeKeyboardAvoidance } from '../utils/iosKeyboardAvoidance';

/**
 * Keeps `targetRef`'s element above the on-screen keyboard inside the iOS
 * shell. A no-op everywhere else: it assumes WKWebView's specific (broken)
 * viewport behaviour, and applying the same translate on mobile Safari or
 * desktop browsers - which already handle this reasonably - would be its
 * own regression.
 */
export const useIOSKeyboardAvoidance = (targetRef: RefObject<HTMLElement>): void => {
  useEffect(() => {
    if (!isIOSShell()) return undefined;
    const target = targetRef.current;
    const { visualViewport } = window;
    if (!target || !visualViewport) return undefined;

    return observeKeyboardAvoidance(target, visualViewport);
  }, [targetRef]);
};
