const { app, BrowserWindow, desktopCapturer, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveRequestPath } = require('./resolve');

// Where the web build lives. In development we read the dist/ the repo's own
// `npm run build` produced; when packaged, electron-builder copies it into the
// app's resources (see the extraResources entry in package.json).
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

const ORIGIN = 'app://loaf';

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
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
    },
  },
]);

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
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
    }
  });

  window.loadURL(`${ORIGIN}/`);
  return window;
}

app.whenReady().then(() => {
  protocol.handle('app', serve);

  // Electron grants permissions by default. Narrow that to what the app
  // actually needs, and only from our own origin.
  const allowed = new Set(['media', 'display-capture', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    // requestingUrl is the frame that actually asked, which matters because
    // element-call runs in an iframe. Electron documents it as optional and
    // omits it for requests not made on behalf of a document, so fall back to
    // the top-level URL rather than denying and breaking calls.
    const requestingUrl = details?.requestingUrl ?? contents.getURL();
    callback(allowed.has(permission) && requestingUrl.startsWith(ORIGIN));
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

  // macOS keeps the app alive with no windows; recreate one when re-activated.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows and Linux quit with the last window; macOS conventionally does not.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
