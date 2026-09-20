const { app, BrowserWindow, net, protocol, session } = require('electron');
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
