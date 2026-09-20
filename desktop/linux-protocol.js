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
      // timeout: a stuck D-Bus session or an unresponsive $HOME mount must
      // not hang app startup — this runs before any window exists.
      execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore', timeout: 3000 });
    } catch {
      // Not installed, timed out, or failed. Not fatal — worst case the
      // entry is stale until the next login or manual refresh.
    }

    try {
      execFileSync('xdg-mime', ['default', 'loaf-chat.desktop', 'x-scheme-handler/loaf'], {
        stdio: 'ignore',
        timeout: 3000,
      });
    } catch {
      // xdg-mime missing, timed out, or no desktop environment to register with.
    }

    copyIcon();
  } catch {
    // Never let desktop-entry bookkeeping stop the app from starting.
  }
}

// The AppImage runtime sets APPDIR to its (temporary, per-run) mount point
// and ships loaf-chat-desktop.png at its root. Copy it into the standard
// hicolor icon theme location so the menu entry above (Icon=loaf-chat, a
// name, never an absolute $APPDIR path since that mount disappears on exit)
// resolves to a real image instead of a generic placeholder.
function copyIcon() {
  const appDir = process.env.APPDIR;
  if (!appDir) return;

  const source = path.join(appDir, 'loaf-chat-desktop.png');
  if (!fs.existsSync(source)) return;

  const iconDir = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
  const iconFile = path.join(iconDir, 'loaf-chat.png');

  const sourceBytes = fs.readFileSync(source);
  const existingBytes = fs.existsSync(iconFile) ? fs.readFileSync(iconFile) : null;
  if (existingBytes === null || !sourceBytes.equals(existingBytes)) {
    fs.mkdirSync(iconDir, { recursive: true });
    fs.writeFileSync(iconFile, sourceBytes);
  }

  try {
    execFileSync('gtk-update-icon-cache', [path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')], {
      stdio: 'ignore',
      timeout: 3000,
    });
  } catch {
    // Not installed, timed out, or failed. Not fatal — the icon file itself
    // is already in place; only the cache refresh is best-effort.
  }
}

module.exports = { ensureDesktopEntry };
