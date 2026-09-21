# Loaf Chat iOS Client — Design

Date: 2026-09-20
Status: approved; blocked on prerequisites (see "Blockers")

## Goal

Ship Loaf Chat on iOS as a WKWebView shell around the existing web app in
`src/`, with push notifications, working voice and video calls, and enough
native polish that it does not feel like a website in a box.

## Non-goals

- **App Store presence.** Explicitly not a driver. Distribution is TestFlight.
  This removes Apple review and the AGPL-vs-App-Store-terms friction from
  scope entirely.
- **Screen sharing.** Not possible. See "Why screen share is out".
- **Incoming-call ringing (CallKit + PushKit).** Deferred past v1. See
  "Why ringing is deferred".
- **A Notification Service Extension.** It could not decrypt E2EE events
  anyway. See "Push".
- **OTA bundle updates.** TestFlight ships the whole app; there is no
  `desktop/updater.js` equivalent and no update code to maintain.
- **A native client.** Considered and rejected: see "Decision: reuse `src/`".

## Blockers

One external blocker, plus one toolchain note.

1. **Xcode is installed but not selected.** `xcode-select -p` points at
   `/Library/Developer/CommandLineTools`, so `xcodebuild` and `simctl` are
   unavailable by default, but Xcode 26.6 with the iOS 26.5 SDK is present at
   `/Applications/Xcode.app`. Export
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` — this needs no
   sudo and no install. Do not infer the install state from the selection
   state; that mistake cost a round trip during design.
2. **Apple Developer Program enrollment is pending.** Carried over from
   `2026-09-19-desktop-client-design.md`. APNs keys require an active paid
   membership, and so does TestFlight. This blocks push and distribution,
   but not the spike, the shell, calls, or the `src/` work.

## Decision: reuse `src/`

The alternative was forking Element X iOS (Swift, `matrix-rust-sdk`,
AGPL-3.0 like us) and rebranding, which would deliver push-with-content,
CallKit and native feel close to free.

Rejected: it is a second fork to maintain in a second language, and Loaf's
customizations — the GIF picker, the themes, the screen-share quality
controls — would not come along. One codebase wins.

The cost is accepted and stated plainly: a webview shell is structurally
worse at exactly the three things that motivated the client. Push content is
capped by what the homeserver can send (see "Push"), and ringing is deferred.

## Background: why the service worker decides the architecture

`src/sw.ts` is a service worker that intercepts
`/_matrix/client/v1/media/{download,thumbnail}` and injects
`Authorization: Bearer <token>`. Matrix authenticated media means **every
avatar and image in the app depends on it.**

`mxcUrlToHttp` has **109 call sites across 53 files**, all consuming a
synchronous string in `src={}`, with no central `Avatar`/`Image` component.
A blob-URL fallback is inherently async. Removing the service-worker
dependency is therefore a large, risky, app-wide refactor — not a step on
the way to iOS.

So the whole iOS architecture reduces to one question: **what origin can we
load that will register a service worker in WKWebView?**

Two facts worth recording, both verified 2026-09-20:

- **There is no offline capability to preserve.** `vite.config.js:107` sets
  `injectManifest: { injectionPoint: undefined }`, which disables precaching,
  and `src/sw.ts` never touches the Cache API. It is purely a media-auth
  proxy. The app already requires network to start.
- **App-bound domains only constrain top-level frames.** Per WebKit's own
  documentation, subresources and even third-party iframes are unaffected.
  A gif-bridge on another origin (`moe.loaf.gif` → `api_url`, see
  `src/app/cs-api.ts:108`) keeps working.

## Decision: bundled origin on a fixed loopback port

Chosen: ship `dist/` inside the app and serve it from
`http://127.0.0.1:8437`. `127.0.0.1` is a potentially-trustworthy origin per
spec, so a service worker should register.

"Should" is doing real work in that sentence — hence the spike below.

### Alternatives considered

- **Remote origin (`https://loaf.moe` + `WKAppBoundDomains`).** The
  documented Apple path, with no feasibility unknown in front of it, and the
  recommendation at design time. Not chosen. **Retained as the fallback if
  the spike fails** — it requires only a change of URL and Info.plist, no
  change to the rest of this design.
- **Capacitor default (`capacitor://localhost`).** Cannot register a service
  worker: WKWebView requires an http(s) scheme. This is the blocker recorded
  in `2026-09-19-desktop-client-design.md:182` and it still holds.
- **Refactor away the service worker.** The 109-call-site change above.
  Rejected as an entry path; retains standalone value as a later cleanup
  that would de-risk every platform at once.

## Step 0: the spike

A throwaway Xcode project, deleted once it answers the question. It serves
`index.html` + `sw.js` from an embedded HTTP server and reports results to
native over `window.webkit.messageHandlers`.

| #   | Origin                       | `WKAppBoundDomains`                                           |
| --- | ---------------------------- | ------------------------------------------------------------- |
| 1   | `http://127.0.0.1:PORT`      | absent                                                        |
| 2   | `http://localhost:PORT`      | absent                                                        |
| 3   | `http://localhost:PORT`      | `["localhost"]` + `limitsNavigationsToAppBoundDomains = true` |
| 4   | `http://127.0.0.1:PORT`      | `["127.0.0.1"]` + same                                        |
| 5   | `https://loaf.moe` (control) | `["loaf.moe"]` + same                                         |

Two conditions on the result:

- **Pass means intercepting, not registering.** A worker reaching
  `activated` is not sufficient — `src/sw.ts` earns its keep in the `fetch`
  handler. The spike passes only if a subresource request returns with the
  injected header.
- **It must run on a physical device, not only the simulator.** Simulator
  WebKit has diverged from device WebKit on this class of gate before.

Config 5 is a control proving the fallback is live. If `WKAppBoundDomains`
rejects non-registrable entries at parse time, 3 and 4 collapse into 1 and 2.

**Outcome gate:** any of 1–4 passing fixes the shell's configuration. All of
1–4 failing switches the design to the remote origin, with no other change.

## The port must be fixed

The origin includes the port. An ephemeral port means a new origin on every
launch, which means a fresh IndexedDB and a re-registered service worker —
**the user would be logged out on every app start.**

So the server binds a fixed `8437`, with a short deterministic fallback list
if that bind fails. A fallback port is a new origin and therefore a fresh
session; that is accepted as rare and visible, not silently tolerated.

This is recorded because the symptom — "Matrix sessions do not persist" —
points nowhere near the cause.

## Architecture

Nothing in `desktop/` changes.

```
ios/
  LoafChat.xcodeproj
  LoafChat/
    AppDelegate.swift        # lifecycle, APNs registration
    WebViewController.swift  # WKWebView config, nav policy, media permissions
    BundleServer.swift       # fixed-port loopback server over the bundled dist/
    CallManager.swift        # CallKit (ongoing call) + AVAudioSession
    PushHandler.swift        # APNs payload -> local notification + badge
    Info.plist
  Resources/dist/            # staged from the web build at package time
mise-tasks/ios-bundle        # builds src/ and stages it into ios/Resources/dist
```

**Boot flow.** `BundleServer` binds `127.0.0.1:8437` -> `WebViewController`
loads `http://127.0.0.1:8437/` -> service worker registers -> app boots ->
on login the existing `src/sw-session.ts` handshake hands the worker the
access token -> media requests carry `Authorization`. All 109 call sites are
untouched.

`BundleServer` must serve an SPA fallback: any unmatched path returns
`index.html`, the same job `desktop/resolve.js` does for `app://`.

## Push

Native receives the APNs device token and passes it over
`webkit.messageHandlers`; JS registers the pusher with `client.setPusher(...)`
against Sygnal. Registration belongs on the JS side because the access token
lives in the webview's IndexedDB.

**Notification content is capped by the homeserver, not by the shell.**
Synapse cannot decrypt E2EE events either, so it sends `event_id`, `room_id`
and counts — but it does include `room_name` and `sender_display_name` from
unencrypted state. Therefore:

- Unencrypted room: sender and message body.
- Encrypted room: "Alice in #general", no body.
- Both: unread count drives the app badge.

A Notification Service Extension is not built. It is a separate process with
a ~24MB ceiling that cannot host a WKWebView, so none of our JS crypto could
run in it; it could not do better than the payload already provides.

## Calls

element-call runs in a same-origin iframe exactly as it does on web and
desktop. Three configuration requirements, each of which fails silently and
misleadingly if missed:

- `WKUIDelegate.webView(_:requestMediaCapturePermissionFor:initiatedByFrame:type:decisionHandler:)`
  **must** be implemented, or `getUserMedia` is denied and element-call
  simply sees no devices.
- `allowsInlineMediaPlayback = true` and
  `mediaTypesRequiringUserActionForPlayback = []`, or remote audio and video
  never autoplay.
- `AVAudioSession`: `.playAndRecord`, mode `.videoChat`, options
  `[.allowBluetooth, .defaultToSpeaker]`. This is what provides echo
  cancellation and correct routing.

v1 uses CallKit for the **ongoing** call only — system call UI, background
audio priority, and correct interruption handling — together with
`UIBackgroundModes: ["audio"]`.

### Why ringing is deferred

CallKit ringing requires PushKit. Since iOS 13 a VoIP push **must** report a
call to CallKit immediately or the OS terminates the app, so a mis-mapped
Matrix invite becomes a crash loop. Sygnal's VoIP support is thin. This is
its own project with its own failure modes and does not belong in v1.

### Why screen share is out

`getDisplayMedia` does not exist in WKWebView; it is not in iOS Safari at
all. iOS screen capture is ReplayKit broadcast extensions, a different
mechanism that cannot feed a webview's WebRTC stack. The existing quality
controls in `src/app/plugins/call/CallControl.ts` remain desktop-only.

## Changes to `src/`

This design departs from the desktop spec's "nothing in `src/` changes".
Native feel is CSS-level and cannot be fixed from the shell. All changes are
iOS-conditional and must not regress web or desktop.

- `viewport-fit=cover` on the viewport meta, and `env(safe-area-inset-*)`
  applied to the app chrome.
- `visualViewport`-based keyboard avoidance for the composer. WKWebView's
  built-in handling is the specific thing that makes webview chat apps feel
  wrong.
- Overscroll / rubber-band suppression on the app shell.
- `src/app/plugins/ios/` — the pusher handshake and a platform flag.

## Error handling

The theme is that nothing fails silently into an app that looks fine.

- **Bind failure** -> deterministic fallback ports -> if all fail, a
  **native** error screen, never a white webview.
- **Service-worker registration failure is asserted and surfaced.** If the
  worker does not take, the app looks completely healthy and every image is
  broken. JS checks registration and reports to native, which shows a
  diagnostic rather than leaving phantom media bugs to be chased.

## Testing

Mirrors how `desktop/` keeps `resolve.test.mjs` and `updater.test.mjs` as
plain runnable tests.

- Swift unit tests for `BundleServer`: port fallback, MIME types, and the
  SPA fallback route.
- The `src/` viewport changes are covered by vitest where they are logic,
  and by the manual ladder where they are visual.

## Success criteria

Ordered; each depends on the previous.

1. Spike resolves the origin question on a physical device.
2. App launches and reaches the login screen.
3. Login to loaf.moe succeeds and survives a restart — proves the fixed port
   held and IndexedDB persisted.
4. Avatars and images render — proves the service worker registered _and_
   intercepts.
5. Navigating to a room and reloading stays on that route — proves the SPA
   fallback.
6. Composer stays above the keyboard; no content under the notch or home
   indicator.
7. A voice call connects with audio both ways, and survives backgrounding.
8. A video call shows both participants.
9. A push notification arrives, with body in unencrypted rooms and
   "sender in room" in encrypted ones; the badge count updates.
10. Installed and run from TestFlight on a device that has never had a
    development build.

## Known risks

- **The spike may fail.** Mitigated by the remote-origin fallback, which is
  a URL and Info.plist change rather than a redesign.
- **Port 8437 may be taken** by another app on the device. Rare; degrades to
  a fresh session rather than a failure to launch.
- **WKWebView WebRTC regressions across iOS releases** are outside our
  control, exactly as the desktop spec notes for the host webview.
- **Enrollment may take longer than the rest of the work**, leaving a
  finished app with no way to distribute it and no way to test push.
