const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// An AppImage installs nothing, so the OS has no .desktop file telling it
// loaf:// belongs to us. Write one ourselves, pointing at wherever this
// AppImage currently is (it may get moved or renamed between runs).
function ensureDesktopEntry() {
  try {
    if (process.platform !== 'linux') return;
    const appImagePath = process.env.APPIMAGE;
    if (!appImagePath) return;

    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    const desktopFile = path.join(appsDir, 'loaf-chat.desktop');

    const contents =
      '[Desktop Entry]\n' +
      'Type=Application\n' +
      'Name=Loaf Chat\n' +
      `Exec="${appImagePath}" %u\n` +
      'Icon=loaf-chat\n' +
      'Categories=Network;InstantMessaging;\n' +
      'MimeType=x-scheme-handler/loaf;\n' +
      'Terminal=false\n' +
      'StartupWMClass=Loaf Chat\n';

    const existing = fs.existsSync(desktopFile) ? fs.readFileSync(desktopFile, 'utf8') : null;
    if (existing !== contents) {
      fs.mkdirSync(appsDir, { recursive: true });
      fs.writeFileSync(desktopFile, contents);
    }

    try {
      execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore' });
    } catch {
      // Not installed, or failed. Not fatal — worst case the entry is stale
      // until the next login or manual refresh.
    }

    try {
      execFileSync('xdg-mime', ['default', 'loaf-chat.desktop', 'x-scheme-handler/loaf'], {
        stdio: 'ignore',
      });
    } catch {
      // xdg-mime missing, or no desktop environment to register with.
    }
  } catch {
    // Never let desktop-entry bookkeeping stop the app from starting.
  }
}

module.exports = { ensureDesktopEntry };
