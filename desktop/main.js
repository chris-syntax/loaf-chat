const { app, BrowserWindow, desktopCapturer, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveRequestPath } = require('./resolve');
const { ensureDesktopEntry } = require('./linux-protocol');
const { initAutoUpdate } = require('./updater');

// Where the web build lives. In development we read the dist/ the repo's own
// `npm run build` produced; when packaged, electron-builder copies it into the
// app's resources (see the extraResources entry in package.json).
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

const ORIGIN = 'loaf://chat';

// MUST run before app.whenReady(). Afterwards it is silently ignored.
//
// Every privilege here is load-bearing:
//   standard           - a real origin, so localStorage and IndexedDB persist.
//                        Without it the crypto store is wiped every launch.
//   secure             - a secure context, without which getUserMedia does not
//                        exist and no call can start.
//   supportFetchAPI    - the app fetches config.json and locales.
//   allowServiceWorkers- src/sw.ts attaches the Authorization header to
//                        authenticated-media requests. Without it every avatar
//                        and image in the client 401s.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'loaf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
    },
  },
]);

// Only one instance may hold the window that SSO redirects back into. Without
// this, the OS launching us a second time (Linux/Windows deliver the loaf://
// callback by starting a new process with the URL in argv) would open a
// second window and the login token would land in the process nobody is
// looking at.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;
// Set when a loaf:// URL arrives before a window exists (macOS can fire
// open-url before app is ready).
let pendingOpenUrl = null;

// Validates the URL is our own origin and loads it into the running window.
// An OS hands us whatever string the requester used with our scheme; without
// this check that string would become an open redirect into arbitrary
// content inside a window that has camera and microphone permissions.
function deliverUrl(url) {
  if (!url.startsWith(`${ORIGIN}/`)) return;
  if (!mainWindow) {
    pendingOpenUrl = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.loadURL(url);
  mainWindow.focus();
}

// Register in dev with the exec path and script argument, otherwise Electron
// registers itself as the default handler, not this script.
if (app.isPackaged) {
  app.setAsDefaultProtocolClient('loaf');
} else {
  app.setAsDefaultProtocolClient('loaf', process.execPath, [path.resolve(process.argv[1])]);
}

// macOS delivers the URL via this event, not argv. Register at module top
// level because it can fire before the app is ready.
app.on('open-url', (event, url) => {
  event.preventDefault();
  deliverUrl(url);
});

// Linux/Windows: the OS starts a new process with the URL in argv. That
// process loses the single-instance lock above, which fires this event in
// the original process instead.
app.on('second-instance', (event, argv) => {
  const url = argv.find((arg) => arg.startsWith(`${ORIGIN}/`));
  if (url) {
    deliverUrl(url);
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function serve(request) {
  const relative = resolveRequestPath(new URL(request.url).pathname);
  const filePath = path.join(DIST, relative);

  // resolveRequestPath already refuses to escape dist/, but this is the last
  // point before the filesystem, so check again rather than trust it.
  if (filePath !== path.join(DIST, 'index.html') && !filePath.startsWith(DIST + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  return net.fetch(pathToFileURL(filePath).toString());
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 400,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
  });

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // Electron denies window.open() by default, and the web app renders every
  // link in chat with target="_blank". Without this, clicking a link silently
  // does nothing. Hand http(s) to the user's real browser and never open a
  // second Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // A target="_self" link would otherwise replace the app with remote content
  // in a window with no back button and no visible menu — an unrecoverable
  // state. Only our own origin may drive top-level navigation.
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
    }
  });

  // Cold start with a loaf:// callback URL already in argv (Linux/Windows),
  // or one that arrived via open-url before this window existed (macOS):
  // load it instead of the default origin.
  //
  // argvUrl is recomputed here on every createWindow() call, including from
  // the macOS 'activate' handler below — harmless today only because argv
  // does not change after launch and macOS never reaches this branch anyway
  // (it delivers URLs via open-url, not argv). If that ever changes, this
  // would silently reload a stale login URL on reactivation.
  const argvUrl = process.argv.find((arg) => arg.startsWith(`${ORIGIN}/`));
  const initialUrl = pendingOpenUrl || argvUrl;
  pendingOpenUrl = null;

  window.loadURL(initialUrl && initialUrl.startsWith(`${ORIGIN}/`) ? initialUrl : `${ORIGIN}/`);
  return window;
}

app.whenReady().then(() => {
  protocol.handle('loaf', serve);

  // AppImages install no .desktop file, so without this the OS never learns
  // the loaf:// scheme belongs to us. No-op on non-Linux and on deb/dev runs.
  ensureDesktopEntry();

  // Electron grants permissions by default. Narrow that to what the app
  // actually needs, and only from our own origin.
  const allowed = new Set(['media', 'display-capture', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    // requestingUrl is the frame that actually asked, which matters because
    // element-call runs in an iframe. Electron documents it as optional and
    // omits it for requests not made on behalf of a document, so fall back to
    // the top-level URL rather than denying and breaking calls.
    const requestingUrl = details?.requestingUrl ?? contents.getURL();
    callback(allowed.has(permission) && requestingUrl.startsWith(`${ORIGIN}/`));
  });

  // element-call calls getDisplayMedia() from inside its iframe; Electron asks
  // the main process which source to hand back. There is no picker yet, so
  // take the primary screen. A source picker window is the follow-up here.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length === 0) {
          callback({});
          return;
        }
        callback({ video: sources[0] });
      })
      .catch(() => callback({}));
  });

  createWindow();

  // Guards itself: no-ops in dev, on macOS, and on any Linux run that is not
  // an AppImage. Called after the window exists so the update dialog can
  // never precede it.
  initAutoUpdate();

  // macOS keeps the app alive with no windows; recreate one when re-activated.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows and Linux quit with the last window; macOS conventionally does not.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
