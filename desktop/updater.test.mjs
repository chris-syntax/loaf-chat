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

  it('never runs on macOS', () => {
    // Squirrel.Mac refuses unsigned updates and no configuration works
    // around it. Attempting a check surfaces an error to no purpose.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'darwin', appImage: undefined })
    ).toBe(false);
  });
});
