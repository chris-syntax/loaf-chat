/**
 * Contract with the native iOS shell (see
 * docs/superpowers/specs/2026-09-20-ios-client-design.md, "Changes to
 * `src/`"): before any page script runs, the WKWebView host sets
 * `window.__LOAF_IOS__ = true`. Every other environment — the public web
 * app, the Electron desktop app, mobile Safari, everything else — must
 * leave the property undefined.
 *
 * This is the only signal iOS-shell-only code may key off. Do not sniff the
 * user agent for this (see `user-agent.ts`): WKWebView's UA string is
 * indistinguishable from mobile Safari's, and mobile Safari must not get
 * behaviour that assumes WKWebView's specific quirks.
 */
declare global {
  interface Window {
    __LOAF_IOS__?: boolean;
  }
}

export const isIOSShell = (): boolean => window.__LOAF_IOS__ === true;
