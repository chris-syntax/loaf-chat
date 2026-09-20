# Loaf Chat Desktop Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Loaf Chat web app as an Electron desktop application for Windows, macOS and Linux, with working voice, video and screen sharing.

**Architecture:** A thin Electron shell in `desktop/` loads the existing `dist/` build over a custom `app://` protocol. Nothing in `src/` changes. The protocol handler ports the routing rules from `docker-nginx.conf` and must be registered with privileges that keep the app's service worker alive, because that service worker is what attaches the `Authorization` header to Matrix authenticated-media requests. Screen sharing is answered in the main process via `setDisplayMediaRequestHandler`.

**Tech Stack:** Electron 44.x, electron-builder 26.x, Node 24.13.1, Vitest (already in the repo).

**Spec:** `docs/superpowers/specs/2026-09-19-desktop-client-design.md`

## Global Constraints

- **Do not modify anything under `src/`.** This is packaging work. If you believe a change in `src/` is required, stop and raise it rather than making it.
- **Node stays at 24.13.1**, matching `.node-version` and `mise.toml`.
- **All new dependencies go in `desktop/package.json`**, never the root manifest. The root is a recurring upstream-merge conflict point.
- **`desktop/` is CommonJS.** The root `package.json` sets `"type": "module"`; `desktop/package.json` sets `"type": "commonjs"` so Electron's main process runs on its best-trodden path. Use `require`/`module.exports` in that directory.
- **The custom scheme is `app://`** and its privileges are `standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true`. All four are load-bearing; see the spec.
- **App ID is `moe.loaf.chat`**, product name `Loaf Chat`.
- **Builds are unsigned.** macOS config sets `"identity": null` explicitly.

---

### Task 1: Request path resolution

The only genuinely testable logic in the shell: turning a request URL into a file inside `dist/`, matching what nginx does in production, and refusing to escape the directory.

**Files:**
- Create: `desktop/resolve.js`
- Create: `desktop/resolve.test.mjs`
- Modify: `vitest.config.ts:6` (add `desktop` to the `include` glob)

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveRequestPath(pathname: string): string` — takes a URL pathname such as `/assets/index-abc.js`, returns a path relative to `dist/` with no leading slash, such as `assets/index-abc.js`. Returns `'index.html'` for anything that is not an allowlisted static file. Never returns a path that escapes `dist/`. Task 2 consumes this.

**Background you need:** `docker-nginx.conf` is the production spec. It serves `config.json`, `manifest.json`, `sw.js`, `pdf.worker.min.js`, `/public/*` and `/assets/*` as real files, and rewrites everything else to `index.html`. That last rule is the SPA fallback: the client uses a history router, so `/room/!abc:loaf.moe` must return the app, not a 404.

The security design is worth understanding before you write it: the allowlist **is** the traversal guard. Normalise the path first, then check the allowlist. A path like `/assets/../../../etc/passwd` normalises to `/etc/passwd`, which is not in the allowlist, so it falls through to `index.html` — harmless. You do not need a separate traversal check for POSIX paths. You *do* need to reject backslashes explicitly, because `path.posix.normalize` leaves them alone but Windows `path.join` treats them as separators.

- [ ] **Step 1: Write the failing test**

Create `desktop/resolve.test.mjs`. Note the extension: `desktop/package.json`
sets `"type": "commonjs"` for Electron's benefit, so a `.js` test there would be
parsed as CommonJS. `.mjs` forces ESM, and ESM importing a CommonJS module is
the interop direction that works cleanly.

```javascript
import { describe, expect, it } from 'vitest';
import { resolveRequestPath } from './resolve.js';

describe('resolveRequestPath', () => {
  it('serves the allowlisted root files', () => {
    expect(resolveRequestPath('/config.json')).toBe('config.json');
    expect(resolveRequestPath('/manifest.json')).toBe('manifest.json');
    expect(resolveRequestPath('/sw.js')).toBe('sw.js');
    expect(resolveRequestPath('/pdf.worker.min.js')).toBe('pdf.worker.min.js');
  });

  it('serves the allowlisted directories', () => {
    expect(resolveRequestPath('/assets/index-abc123.js')).toBe('assets/index-abc123.js');
    expect(resolveRequestPath('/public/locales/en/translation.json')).toBe(
      'public/locales/en/translation.json'
    );
  });

  it('serves the vendored element-call bundle', () => {
    // CallEmbed points an iframe here; if this falls through to index.html,
    // calls break with no obvious error.
    expect(resolveRequestPath('/public/element-call/index.html')).toBe(
      'public/element-call/index.html'
    );
  });

  it('falls back to index.html for app routes', () => {
    expect(resolveRequestPath('/')).toBe('index.html');
    expect(resolveRequestPath('/home')).toBe('index.html');
    expect(resolveRequestPath('/room/!abc:loaf.moe')).toBe('index.html');
  });

  it('refuses to escape dist via traversal', () => {
    expect(resolveRequestPath('/assets/../../../etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/public/../../etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/../package.json')).toBe('index.html');
  });

  it('refuses to escape dist via percent-encoded traversal', () => {
    expect(resolveRequestPath('/public/%2e%2e/%2e%2e/etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/assets/..%2f..%2fetc/passwd')).toBe('index.html');
  });

  it('rejects backslashes, which Windows would treat as separators', () => {
    expect(resolveRequestPath('/assets/..\\..\\package.json')).toBe('index.html');
  });

  it('survives malformed input', () => {
    expect(resolveRequestPath('/assets/%ZZ')).toBe('index.html');
    expect(resolveRequestPath('/assets/\0foo')).toBe('index.html');
  });
});
```

- [ ] **Step 2: Add `desktop` to the Vitest include glob**

`vitest.config.ts` currently only looks inside `src/`. Change the `include` line so it reads:

```typescript
    include: ['src/**/*.test.{ts,tsx}', 'desktop/**/*.test.mjs'],
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- desktop/resolve.test.mjs`
Expected: FAIL — cannot find module `./resolve`.

- [ ] **Step 4: Write the implementation**

Create `desktop/resolve.js`:

```javascript
const path = require('node:path');

// Ported from docker-nginx.conf. That file is the production behaviour, so it
// is the specification here: anything it serves as a file, we serve as a file,
// and everything else falls through to index.html for the SPA router.
const FILES = new Set(['/config.json', '/manifest.json', '/sw.js', '/pdf.worker.min.js']);
const DIRECTORIES = ['/public/', '/assets/'];

const FALLBACK = 'index.html';

/**
 * Map a request pathname onto a path relative to dist/.
 *
 * The allowlist doubles as the traversal guard: a normalised path that climbs
 * out of an allowlisted directory no longer matches the allowlist, so it falls
 * through to the SPA fallback instead of reaching the filesystem.
 */
function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding. Not worth an error page; it is not a file.
    return FALLBACK;
  }

  // NUL truncates paths in some syscalls, and a backslash is a separator on
  // Windows but not to path.posix, so neither may reach path.join.
  if (decoded.includes('\0') || decoded.includes('\\')) return FALLBACK;

  const normalized = path.posix.normalize(decoded);

  if (FILES.has(normalized)) return normalized.slice(1);
  if (DIRECTORIES.some((dir) => normalized.startsWith(dir))) return normalized.slice(1);

  return FALLBACK;
}

module.exports = { resolveRequestPath };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- desktop/resolve.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 6: Confirm you did not break the existing suite**

Run: `npm test`
Expected: PASS — the 11 existing tests in `src/app/utils/gifBridge.test.ts` plus your 8.

- [ ] **Step 7: Commit**

```bash
git add desktop/resolve.js desktop/resolve.test.mjs vitest.config.ts
git commit -m "feat(desktop): add request path resolution for the app:// protocol"
```

---

### Task 2: Electron shell

Gets the app on screen and proves the hard parts work: persistent storage, a live service worker, and the SPA fallback.

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/main.js`
- Modify: `.gitignore` (ignore `desktop/node_modules` and `desktop/release`)

**Interfaces:**
- Consumes: `resolveRequestPath(pathname)` from Task 1.
- Produces: `desktop/main.js` as the Electron entry point, and an `npm start` script inside `desktop/`. Task 3 adds a handler to the same file; Task 4 adds build config to the same `package.json`.

**Background you need:** There is no preload script and no IPC. The renderer is our own web app loading over a privileged scheme; it needs nothing from Node. Leave `nodeIntegration` off and `contextIsolation` on (both are the defaults — do not turn them off).

`protocol.registerSchemesAsPrivileged()` must be called at module top level, **before** `app.whenReady()`. Called afterwards it silently does nothing, and you get an app that loads but cannot persist a login — a confusing failure worth avoiding by construction.

- [ ] **Step 1: Create the package manifest**

Create `desktop/package.json`:

```json
{
  "name": "loaf-chat-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Electron shell for Loaf Chat",
  "type": "commonjs",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^44.4.3"
  }
}
```

- [ ] **Step 2: Install it**

```bash
cd desktop && npm install
```

Expected: Electron downloads a platform binary. This is a large download the first time.

- [ ] **Step 3: Ignore the build artefacts**

Append to `.gitignore`:

```
desktop/node_modules
desktop/release
```

- [ ] **Step 4: Write the main process**

Create `desktop/main.js`:

```javascript
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
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed.has(permission) && contents.getURL().startsWith(ORIGIN));
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
```

- [ ] **Step 5: Build the web app**

From the repo root:

```bash
npm run build
```

Expected: `dist/` exists and contains `index.html`, `sw.js`, `assets/` and `public/element-call/`.

- [ ] **Step 6: Launch the shell**

```bash
cd desktop && npm start
```

Expected: a window showing the Loaf Chat login screen.

- [ ] **Step 7: Verify the four things that can silently be wrong**

Work through these in order; each depends on the one before.

1. **Login to loaf.moe succeeds.**
2. **Quit the app entirely, relaunch, and confirm you are still logged in.** If you are logged out, `standard: true` did not take effect and IndexedDB is not persisting — check that `registerSchemesAsPrivileged` runs before `whenReady`.
3. **Avatars and images render in the timeline.** This is the service worker check, and the single most likely thing to be broken. If avatars are blank or broken, open DevTools (`Ctrl/Cmd+Shift+I`) → Application → Service Workers and confirm one is registered and activated. A 401 on `/_matrix/client/v1/media/...` in the Network tab means it is not.
4. **Open a room, then reload the window (`Ctrl/Cmd+R`).** You should land back in the room, not on an error. This proves the SPA fallback.

- [ ] **Step 8: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/main.js .gitignore
git commit -m "feat(desktop): add Electron shell serving dist over app://"
```

---

### Task 3: Screen sharing

**Files:**
- Modify: `desktop/main.js` (add the handler inside `app.whenReady()`)

**Interfaces:**
- Consumes: the `app.whenReady()` block from Task 2.
- Produces: nothing other tasks depend on.

**Background you need:** Loaf Chat does not implement WebRTC. Calls are element-call running in a same-origin iframe (`src/app/plugins/call/CallEmbed.ts`), and that iframe already carries `allow="microphone; camera; display-capture; ..."` on line 143. When element-call calls `getDisplayMedia()`, Electron routes it to `setDisplayMediaRequestHandler` in the main process. Without a handler, the request is denied and screen sharing silently does nothing.

Ship the trivial version: return the primary screen with no picker. That proves the whole pipe — iframe, widget API, element-call, Electron, and the OS capture backend — without a picker UI confusing the diagnosis. A real picker is a follow-up.

- [ ] **Step 1: Add `desktopCapturer` to the imports**

In `desktop/main.js`, change the first line to:

```javascript
const { app, BrowserWindow, desktopCapturer, net, protocol, session } = require('electron');
```

- [ ] **Step 2: Register the handler**

Inside `app.whenReady().then(...)`, directly after the `setPermissionRequestHandler` block, add:

```javascript
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
```

- [ ] **Step 3: Relaunch and place a call**

```bash
cd desktop && npm start
```

You need a second participant — a browser tab logged in as another account on loaf.moe is enough.

- [ ] **Step 4: Verify the call pipeline in order**

1. **Voice call connects, audio works both ways.**
2. **Video call shows both participants.**
3. **Screen share reaches the remote participant.**

On macOS the first screen-share attempt triggers the system Screen Recording permission prompt and returns black frames until it is granted, after which the app must be restarted. That is expected OS behaviour, not a bug in the handler.

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js
git commit -m "feat(desktop): answer getDisplayMedia with the primary screen"
```

---

### Task 4: Packaging

**Files:**
- Modify: `desktop/package.json` (add electron-builder, the `dist` script, and the `build` block)

**Interfaces:**
- Consumes: everything above.
- Produces: installers in `desktop/release/`.

**Background you need:** The `extraResources` entry is what puts the repo's `dist/` inside the packaged app, matching the `app.isPackaged` branch in `main.js`. `"identity": null` tells electron-builder to skip macOS signing outright rather than fail looking for a certificate.

`extendInfo` matters more than it looks: macOS terminates an app that touches the camera or microphone without a usage-description string in its `Info.plist`. Without these two keys, calls crash the app on macOS instead of failing gracefully.

- [ ] **Step 1: Install electron-builder**

```bash
cd desktop && npm install --save-dev electron-builder@^26.15.3
```

- [ ] **Step 2: Add the build configuration**

Add a `dist` script and a `build` block to `desktop/package.json`, so it reads:

```json
{
  "name": "loaf-chat-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Electron shell for Loaf Chat",
  "type": "commonjs",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "^44.4.3",
    "electron-builder": "^26.15.3"
  },
  "build": {
    "appId": "moe.loaf.chat",
    "productName": "Loaf Chat",
    "directories": {
      "output": "release"
    },
    "files": [
      "main.js",
      "resolve.js",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "../dist",
        "to": "dist"
      }
    ],
    "win": {
      "target": "nsis"
    },
    "mac": {
      "target": "dmg",
      "identity": null,
      "extendInfo": {
        "NSCameraUsageDescription": "Loaf Chat uses the camera for video calls.",
        "NSMicrophoneUsageDescription": "Loaf Chat uses the microphone for voice and video calls."
      }
    },
    "linux": {
      "target": [
        "AppImage",
        "deb"
      ],
      "category": "Network"
    }
  }
}
```

- [ ] **Step 3: Build for the platform you are on**

From the repo root, make sure `dist/` is current, then package:

```bash
npm run build
cd desktop && npm run dist
```

Expected: an installer in `desktop/release/`. electron-builder uses a default Electron icon; a branded icon is a follow-up.

- [ ] **Step 4: Install the packaged build and re-verify**

Install from the artefact — do not just run `npm start` again. The packaged build reads `dist/` from `process.resourcesPath`, a different code path than development, and it is the one users get.

Repeat the checks from Task 2 Step 7 and Task 3 Step 4 against the installed application:

1. Login persists across a restart.
2. Avatars render.
3. Reloading inside a room stays in the room.
4. A video call connects.
5. Screen sharing reaches the remote participant.

- [ ] **Step 5: Commit**

```bash
git add desktop/package.json desktop/package-lock.json
git commit -m "feat(desktop): package with electron-builder for win/mac/linux"
```

- [ ] **Step 6: Repeat Steps 3 and 4 on the other two platforms**

electron-builder does not meaningfully cross-compile these targets, so Windows, macOS and Linux each need a build on that platform. Do this before adding CI: a GitHub Actions matrix debugging a build that has never worked locally is the slowest possible feedback loop.

Record any platform-specific problems rather than fixing them ad hoc — they are likely to need their own task.
