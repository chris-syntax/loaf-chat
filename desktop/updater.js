// electron and electron-updater are required inside initAutoUpdate(), not at
// module scope, so this file can be imported by the unit test in a plain node
// process where neither module can load.

const SIX_HOURS = 6 * 60 * 60 * 1000;

// Whether electron-updater can do anything useful in this process. Every
// false branch is a configuration where calling it would throw or mislead.
function shouldAutoUpdate({ isPackaged, platform, appImage }) {
  if (!isPackaged) return false;
  if (platform === 'linux') return Boolean(appImage);
  // darwin is allowed only because the DMG is now signed with a Developer ID
  // certificate and notarized. Squirrel.Mac verifies that signature before it
  // swaps the bundle and refuses the update outright if it is missing, so
  // reverting the signing setup must also revert this line.
  return platform === 'darwin' || platform === 'win32';
}

function initAutoUpdate() {
  const { app, BrowserWindow, dialog } = require('electron');

  if (
    !shouldAutoUpdate({
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImage: process.env.APPIMAGE,
    })
  ) {
    return;
  }

  const { autoUpdater } = require('electron-updater');

  // electron-updater re-validates the cached file and re-emits
  // 'update-downloaded' on every check, not just the first — so without this,
  // declining once still means the dialog resurfaces every 6 hours forever.
  // Keyed by version, not a boolean, so a genuinely newer release still asks.
  let declinedVersion = null;
  // Set immediately before quitAndInstall() so the error handler below can
  // tell "the user just asked to install and it failed" apart from a routine
  // background check failure.
  let installRequested = false;

  autoUpdater.on('update-downloaded', async (info) => {
    if (declinedVersion === info.version) return;

    // Parent the dialog so it can't stack behind the main window (most
    // Linux window managers) and so a second check can't open a second one
    // on top of it while this await is pending.
    const parent = BrowserWindow.getAllWindows()[0];
    const options = {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Loaf Chat ${info.version} is ready to install.`,
      detail: 'Restart to finish updating.',
    };
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      installRequested = true;
      autoUpdater.quitAndInstall();
    } else {
      // Declining is not a cancellation: the download is already staged and
      // electron-updater installs it on the next quit by default.
      declinedVersion = info.version;
    }
  });

  // A failed background check must never reach the user, block startup, or
  // interrupt a call — there is no retry logic, the next tick is the retry.
  // But an error that follows an explicit "Restart now" click (e.g.
  // quitAndInstall() failing to replace a read-only AppImage) is not a
  // background failure: the user is sitting there expecting a restart that
  // silently never happens, so that one case gets a dialog.
  autoUpdater.on('error', (error) => {
    console.error('[updater]', error);
    if (installRequested) {
      installRequested = false;
      dialog.showErrorBox('Update failed', 'Loaf Chat could not install the update. It will try again next time you restart the app.');
    }
  });

  // checkForUpdates() both emits 'error' and rejects. The handler above does
  // the reporting; this only keeps the rejection from being unhandled.
  const check = () => autoUpdater.checkForUpdates().catch(() => {});

  check();
  // A chat client stays open for days. Checking only at launch means a
  // machine that is never restarted is never updated.
  setInterval(check, SIX_HOURS);
}

module.exports = { shouldAutoUpdate, initAutoUpdate };
