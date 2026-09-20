import { describe, expect, it } from 'vitest';
import { shouldAutoUpdate } from './updater.js';

describe('shouldAutoUpdate', () => {
  it('never runs in development', () => {
    // A dev run has no packaged app and no update feed; electron-updater
    // throws rather than no-ops if asked.
    expect(
      shouldAutoUpdate({ isPackaged: false, platform: 'win32', appImage: undefined })
    ).toBe(false);
    expect(
      shouldAutoUpdate({ isPackaged: false, platform: 'linux', appImage: '/tmp/LoafChat.AppImage' })
    ).toBe(false);
  });

  it('runs on packaged Windows', () => {
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'win32', appImage: undefined })
    ).toBe(true);
  });

  it('runs on Linux only inside an AppImage', () => {
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'linux', appImage: '/opt/LoafChat.AppImage' })
    ).toBe(true);
    // An extracted AppImage run directly. There is no AppImage file to
    // replace, so the AppImage updater has nothing to work with.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'linux', appImage: undefined })
    ).toBe(false);
  });

  it('runs on packaged macOS', () => {
    // Squirrel.Mac validates the signature on every update it installs, so
    // this was false for as long as the DMG shipped unsigned. Builds are now
    // signed with a Developer ID certificate and notarized, which is the only
    // thing that was ever blocking it.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'darwin', appImage: undefined })
    ).toBe(true);
  });
});
