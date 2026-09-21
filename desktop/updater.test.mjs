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

  it('runs on packaged macOS only when the build is signed', () => {
    // Squirrel.Mac validates the signature on every update it installs and
    // refuses an unsigned bundle outright. An unsigned build left to check
    // anyway would download, fail, and report nothing — a client that looks
    // healthy and silently never updates again.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'darwin', macSigned: true })
    ).toBe(true);
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'darwin', macSigned: false })
    ).toBe(false);
    // Absent rather than false: an unsigned build has no macSigned key at all,
    // because CI injects it only on the signed path.
    expect(shouldAutoUpdate({ isPackaged: true, platform: 'darwin' })).toBe(false);
  });

  it('ignores macSigned on the other platforms', () => {
    // The flag is macOS-specific. A Windows or AppImage build must not become
    // dependent on it, or a change to how CI injects it would silently
    // disable updates on platforms that never needed it.
    expect(shouldAutoUpdate({ isPackaged: true, platform: 'win32' })).toBe(true);
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'linux', appImage: '/opt/LoafChat.AppImage' })
    ).toBe(true);
  });
});
