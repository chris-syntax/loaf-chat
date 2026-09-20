# Loaf Chat Desktop Client — Design

Date: 2026-09-19
Status: approved, not yet implemented

## Goal

Ship Loaf Chat as a desktop application on Windows, macOS and Linux, with
working voice, video and screen sharing.

## Non-goals

- **iOS.** Descoped for now. See "Why iOS is not here" below — the blocker is
  recorded so the next person does not rediscover it.
- **Code signing.** No Apple Developer Program membership and no Windows
  Authenticode certificate exist yet. First builds ship unsigned.
- **Auto-update.** Superseded — see `2026-09-19-desktop-autoupdate-design.md`.
  AppImage and Windows do auto-update; macOS remains blocked on signing.
- **Changes to `src/`.** This is packaging work. The web app is already
  correct for this target.

## Background: how calls actually work here

Loaf Chat does not implement WebRTC. Calls are element-call — our vendored
fork, see `mise-tasks/vendor-element-call` — running in a same-origin iframe
and driven over the widget API from `src/app/plugins/call/CallEmbed.ts`.

Two consequences shape this entire design:

1. "Does screen share work" is a question about the **host webview**, not
   about our code. Whatever engine the shell embeds is what element-call gets.
2. `CallEmbed.ts:143` already sets
   `iframe.allow = 'microphone; camera; display-capture; autoplay; clipboard-write;'`
   and element-call is served same-origin out of `dist/public/element-call`.
   The app side is already correct. Nothing in `src/` needs to change.

## Decision: Electron, not Tauri

Tauri embeds the host's webview rather than shipping its own: WebView2 on
Windows, WKWebView on macOS, WebKitGTK on Linux. This is rejected for two
reasons.

**Linux is a lottery.** WebKitGTK only gained portal-based capture in 2.50
(November 2025). Shipping on Tauri means screen share works or not depending
on how recent the user's distro packages are — and we cannot reproduce a bug
whose cause is the user's system library version.

**We would lose the screen-share picker.** Electron's
`session.setDisplayMediaRequestHandler()` lets us enumerate sources with
`desktopCapturer` and render our own picker. Tauri surfaces the webview's
built-in picker, which we cannot style or control. That matters concretely:
we already built custom screen-share quality controls
(`src/app/plugins/call/CallControl.ts`, and the element-call fork vendored at
28da7a19). Under Tauri that work sits behind a picker we cannot touch.

Electron's cost is a ~150MB install and a main process to maintain. Accepted:
identical Chromium on all three platforms is worth it for an app whose
headline feature is calls.

## Architecture

All new code lives in `desktop/`. Nothing outside it changes.

```
desktop/
  main.js          # window lifecycle, app:// protocol, display-media handler
  resolve.js       # request path -> file in dist/, ported from nginx rules
  package.json     # electron-builder configuration
```

The shell loads the existing `dist/` output. `npm run build` stays the single
way the web app is built; desktop packaging consumes its output and never
forks it.

`desktop/` keeps its own `package.json`, holding the `electron` and
`electron-builder` dependencies and the build configuration, rather than
adding them to the root manifest. The reason is merge pressure: this is a
cinny fork that merges upstream regularly, and the root `package.json` is
already a recurring conflict (it carries our name, version and the vendored
element-call tarball). Every line we do not add there is a line that cannot
conflict with upstream later.

### The `app://` protocol handler

This is the part carrying real risk, so its requirements are spelled out.

The shell must not load from `file://`: that gives an opaque origin, which
breaks `localStorage`, IndexedDB and secure-context APIs. Instead register a
custom `app://` scheme, calling `protocol.registerSchemesAsPrivileged()`
**before** `app.whenReady()` — it is a no-op afterwards. Three flags matter:

- `standard: true` — gives a real, stable origin. Without it, IndexedDB does
  not persist, which means the matrix-sdk-crypto store is wiped on every
  launch and the client re-verifies itself forever.
- `secure: true` — marks it a secure context. `getUserMedia` does not exist
  outside one, so without this there are no calls at all.
- `supportFetchAPI: true` — the app fetches `config.json` and its locale files.
- `allowServiceWorkers: true` — see below. Non-negotiable.

### Why the service worker must keep working

`src/sw.ts` is not an offline cache. It intercepts the paths in its
`MEDIA_PATHS` list — `/_matrix/client/v1/media/download` and
`/_matrix/client/v1/media/thumbnail` — and attaches the `Authorization`
header, because Matrix authenticated media (MSC3916, spec v1.11) requires one.

`src/app/hooks/useMediaAuthentication.ts` turns those URLs on whenever the
homeserver advertises v1.11, which loaf.moe does. The app then puts them
straight into `<img src>`, where no header can be attached. There is no
fallback path in the codebase.

So if the service worker does not register, every avatar and every image in
the client 401s. This is the single most likely way to get a desktop build
that looks nearly right and is badly broken, which is why
`allowServiceWorkers` is called out as its own requirement.

**Verification**: avatars rendering is the check that proves the service
worker registered. Treat it as the smoke test, not a cosmetic detail.

### Request routing

`docker-nginx.conf` is the specification for what the protocol handler must
do. Port its rules rather than inventing new ones:

| Request | Served as |
|---|---|
| `/config.json`, `/manifest.json` | file |
| `/sw.js`, `/pdf.worker.min.js` | file |
| `/public/*`, `/assets/*` | file |
| everything else | `index.html` |

The SPA fallback is required: the client uses a history router
(`config.json` sets `hashRouter.enabled: false`), so a deep link or a reload
on any in-app route hits the handler as a path that does not exist on disk.

Resolve every path inside `dist/` and reject anything escaping it, so a
crafted URL cannot read arbitrary files off the user's disk.

### Screen sharing

`session.setDisplayMediaRequestHandler()` receives the request that
element-call's `getDisplayMedia()` call triggers, and answers it with a source
from `desktopCapturer.getSources()`.

Ship the trivial version first: return the primary screen unconditionally.
That proves the whole pipe end to end — iframe, widget API, element-call,
Electron handler, PipeWire/CoreGraphics/DXGI — without a picker UI confusing
the diagnosis. A real picker window is a follow-up, and is where the existing
quality controls eventually attach.

On macOS, screen capture requires the Screen Recording permission; the first
attempt triggers the system prompt and returns black frames until granted.
Expect this during testing rather than debugging it as a bug.

### Packaging

electron-builder, targeting NSIS (Windows), DMG (macOS), AppImage and deb
(Linux). Set `"identity": null` for macOS to skip signing outright rather than
failing on a missing certificate.

Unsigned builds warn on first launch: SmartScreen on Windows, right-click-open
on macOS. Accepted for now; revisit when certificates exist.

Build locally first on all three platforms. Add CI only once the local build
is known good — a GitHub Actions matrix debugging a build that has never
worked is the slowest possible feedback loop.

### Versions

Electron 44.x and electron-builder 26.x are current as of this date. Node
stays pinned at 24.13.1 to match `.node-version` and `mise.toml`.

## Why iOS is not here

Recorded so it is not rediscovered from scratch.

Capacitor serves local assets from `capacitor://localhost`. Service workers
cannot register on a custom scheme — WKWebView requires http or https. By the
reasoning above, no service worker means no `Authorization` header on media,
which means every image in the app breaks.

The obvious fix is not cheap. `mxcUrlToHttp` has 109 call sites across 53
files with no central `Avatar`/`Image` component, and a blob-URL fallback is
inherently async while all of those call sites consume a synchronous string in
`src={}`. Native interception does not rescue it either: WKWebView can only
intercept custom schemes via `WKURLSchemeHandler`, and these are ordinary
cross-origin `https://loaf.moe` requests.

The promising untested option is to run a local HTTP server inside the iOS app
and serve the bundle from `http://localhost:PORT`, which is a secure context,
so the existing service worker would register unchanged. Whether WKWebView's
App-Bound Domains rules permit this is unconfirmed and should be spiked before
any iOS work is committed to.

## Success criteria

Ordered; each depends on the previous.

1. App launches and reaches the login screen.
2. Login to loaf.moe succeeds and survives a restart — proves `standard: true`
   gave IndexedDB a persistent origin.
3. Avatars and images render — proves the service worker registered.
4. Navigating to a room and reloading the window stays on that route rather
   than 404ing — proves the SPA fallback. (OS-level `loaf://` deep linking is
   out of scope.)
5. A voice call connects with working audio both ways.
6. A video call shows both participants.
7. Screen sharing shows the shared screen to the remote participant.
8. All of the above on Windows, macOS and Linux.

## Follow-ups and known risks

Recorded when the Linux implementation landed.

**Screen sharing on Wayland is the least certain part.** `desktopCapturer.getSources({ types: ['screen'] })` depends on PipeWire and xdg-desktop-portal rather than on anything in this repo, and can return an empty array where the portal is not negotiated. The development machine runs Wayland. If screen share fails while voice and video work, try launching with `--enable-features=WebRTCPipeWireCapturer` before treating it as a defect in the handler. The flag is deliberately not set by default: recent Electron enables PipeWire capture on its own, and a flag added speculatively is its own source of bugs.

**The screen-share picker.** The handler returns whichever screen `desktopCapturer` lists first. On a multi-monitor machine there is no way to pick another, and a failed `getSources()` surfaces only as a rejected promise with no UI. Both are the picker's job.

**macOS and Windows builds.** Only AppImage and deb are built. The `mac` and `win` blocks in `desktop/package.json` are configuration for later. macOS is the more likely to surprise: the Screen Recording permission prompt and the two `Info.plist` usage-description keys are paths nothing on Linux exercises.

**`setPermissionCheckHandler` is not implemented**, only `setPermissionRequestHandler`. Electron consults the check handler for some programmatic queries such as `navigator.permissions.query()`, and it defaults to permissive. It is not on the path `getUserMedia` or `getDisplayMedia` take, so calls are unaffected.
