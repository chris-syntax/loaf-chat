// electron and electron-updater are required inside initAutoUpdate(), not at
// module scope, so this file can be imported by the unit test in a plain node
// process where neither module can load.

const SIX_HOURS = 6 * 60 * 60 * 1000;

// Whether electron-updater can do anything useful in this process. Every
// false branch is a configuration where calling it would throw or mislead.
function shouldAutoUpdate({ isPackaged, platform, appImage }) {
  if (!isPackaged) return false;
  if (platform === 'darwin') return false;
  if (platform === 'linux') return Boolean(appImage);
  return platform === 'win32';
}

function initAutoUpdate() {
  const { app, dialog } = require('electron');

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

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Loaf Chat ${info.version} is ready to install.`,
      detail: 'Restart to finish updating.',
    });
    // Declining is not a cancellation: the download is already staged and
    // electron-updater installs it on the next quit by default.
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // A failed check must never reach the user, block startup, or interrupt a
  // call. There is no retry logic; the next tick is the retry.
  autoUpdater.on('error', (error) => {
    console.error('[updater]', error);
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
