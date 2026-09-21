# Loaf Chat Desktop — Automatic Updates — Design

Date: 2026-09-19
Status: approved, not yet implemented

Supersedes the "Auto-update" non-goal in
`2026-09-19-desktop-client-design.md`. Everything else in that document
still holds; read it first.

## Goal

A packaged Loaf Chat desktop build checks for, downloads and installs its
own updates, on the two platforms we actually ship.

## Scope

| Target | Ships? | Auto-updates? |
|---|---|---|
| Linux AppImage | yes | yes, electron-updater (zsync) |
| Windows NSIS | yes | yes, electron-updater |
| Linux `.deb` | **no — dropped** | n/a |
| macOS DMG (arm64), signed | yes | yes, electron-updater (Squirrel.Mac) |
| macOS DMG (arm64), unsigned | yes | **no** — ad-hoc signed, Gatekeeper rejects |

### Why the two exclusions

**`.deb` is dropped entirely.** It never auto-updated — electron-updater has
no path for it; that needs an apt repository, which is separate
infrastructure nobody asked for. Rather than ship a package that silently
rots on users' machines, we stop shipping it. Its `linux.target` entry is
removed.

The `author` field in `desktop/package.json` was added for deb packaging
(commit cedba7c). It stays — electron-builder is happier with it present and
removing it is churn for no gain.

**macOS was blocked, not deferred by preference — and is now unblocked.**
Squirrel.Mac refuses unsigned updates and no configuration works around it;
it needed an Apple Developer Program membership first. That membership was
bought on 2026-09-20, so macOS now builds in CI, ships signed and notarized,
and auto-updates like the other two. See "macOS signing and notarization"
below. Only the exclusion of `.deb` survives from this section.

## Architecture

### Client: `desktop/updater.js`

New file, self-contained, ~30 lines. `electron-updater` is added to
`desktop/package.json` — never to the root manifest. Reason unchanged from
the parent spec: this fork merges upstream cinny regularly and the root
`package.json` is a recurring conflict point.

`main.js` calls one exported function after the window exists. Nothing under
`src/` changes. That constraint is why the update prompt is a native Electron
dialog rather than in-app UI.

**Three guards, in order, before anything else runs:**

```js
if (!app.isPackaged) return;                                        // dev runs
if (process.platform === 'linux' && !process.env.APPIMAGE) return;  // unpacked
if (process.platform === 'darwin' && !macSigned) return;            // unsigned
```

Each one prevents electron-updater from throwing on a configuration where it
cannot work. The Linux guard now covers only "someone extracted the AppImage
and ran the binary directly", but it is one line and it is what makes the
"inert everywhere else" claim true.

The darwin guard was originally unconditional. On 2026-09-20 it became
conditional on `macSigned`, a flag the release workflow injects through
electron-builder's `extraMetadata` and only on the signed path. It is
therefore absent from an unsigned build and from every development run.

This matters because the two are not interchangeable. Gating on the platform
would ship an updater into unsigned builds that can only fail: Squirrel.Mac
refuses the bundle, the error handler swallows it as a routine background
failure, and the user is left with a client that looks healthy and never
updates. Gating on the signature means an unsigned build simply does not
check, and the same binary starts updating the moment it is built with
credentials — no second code change.

**Check cadence:** once at startup, then every 6 hours on a `setInterval`. A
chat client stays open for days; checking only at launch means a machine that
is never rebooted never updates.

**On `update-downloaded`:** a native `dialog.showMessageBox` offering
"Restart now" / "Later". Yes calls `autoUpdater.quitAndInstall()`. No does
nothing further — the update is already staged and applies on next quit.

**On `error`:** log and swallow. A failed update check must never surface to
the user, block startup, or interrupt a call. There is no retry logic; the
next 6-hour tick is the retry.

### The AppImage filename must be pinned

Set an `artifactName` for the AppImage that contains no version — e.g.
`LoafChat.AppImage`. Avoid a space in it: the filename
appears in the zsync update feed URL, and unencoded spaces there are a
wrinkle nobody needs.

This is the one piece of config carrying real risk. `desktop/linux-protocol.js`
writes `~/.local/share/applications/loaf-chat.desktop` with an absolute
`Exec=` path to the running AppImage, and that desktop entry is what routes
`loaf://` callbacks back from the system browser — i.e. it is what makes SSO
work. If a self-update writes the new build to a different path, that entry
points at a deleted file until the next launch rewrites it, and sign-in
breaks in the window between.

Pinning the filename means the path cannot change, so the question of exactly
how electron-updater handles a renamed AppImage never has to be answered, and
`linux-protocol.js` needs no changes at all.

### macOS signing and notarization

Added 2026-09-20. Four details decide whether a macOS build works, and three
of them fail silently.

**The ZIP target is not optional.** `mac.target` must list both `dmg` and
`zip`. electron-builder's own `MacConfiguration` docs put it plainly:
"Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be
enabled, even when only `dmg` is used." electron-updater installs from the
ZIP; the DMG is only the thing a human downloads. A `dmg`-only config
produces a release that installs fine and never updates.

**Entitlements replace, they do not merge.** electron-builder uses
`build/entitlements.mac.plist` *instead of* its built-in template when the
file exists (`getEntitlements` in app-builder-lib's `MacTargetHelper`), so
`desktop/build/entitlements.mac.plist` restates the three Electron runtime
entitlements — `allow-jit`, `allow-unsigned-executable-memory`,
`disable-library-validation`. Omitting them yields an app that is correctly
signed, correctly notarized, and crashes on launch. Helper processes are
unaffected: they resolve `entitlements.mac.inherit.plist`, which we do not
ship, so they keep the template.

**Camera and microphone need entitlements, not just usage strings.** The
hardened runtime is on by default for non-MAS builds and is required for
notarization. The `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`
keys in `mac.extendInfo` only supply the text of the TCC prompt — the
`com.apple.security.device.camera` and `.audio-input` entitlements are what
let the process open the devices. Without them a call connects and carries no
audio or video, which reads as a broken app rather than a packaging mistake.

**`APPLE_API_KEY` is a path, not a key.** electron-builder forwards it to
`@electron/notarize`, which passes it to `notarytool --key`. The CI step
therefore keeps the base64 of the `.p8` in a differently-named secret and
decodes it to a temporary file. The published docs describe this variable as
holding base64 content; the source does not agree, and the source wins.

The mac credentials live on their own workflow step. `CSC_LINK` is read on
Windows too, for Authenticode, and `getCscLink()` treats an empty string as a
value rather than as unset — so there is no way to hand these to a shared
step and have the Windows runner ignore them.

macOS is arm64 only. Intel Macs are not served.

### Publish configuration

```json
"publish": {
  "provider": "github",
  "owner": "chris-syntax",
  "repo": "loaf-chat",
  "releaseType": "release"
}
```

The repository is public, so no token is shipped to clients. `releaseType`
must be set explicitly: electron-builder defaults to **draft**, and a draft
release is invisible to non-collaborators and unreadable by electron-updater.
A first release left as a draft serves nobody and fails silently.

electron-builder generates `latest.yml` (Windows) and `latest-linux.yml`
(AppImage) into the release; those are the update feed.

## Release pipeline

One new workflow, `.github/workflows/desktop-release.yml`, triggered on tags
matching `desktop-v*`.

**Job 1 — `build-web` (ubuntu-latest).** `npm ci && npm run build` at the
repository root, upload `dist/` as an artifact. This is the same recipe as
`build-pull-request.yml`, which is known to work.

**Job 2 — `package` (matrix: ubuntu-latest, windows-latest, macos-latest).**
Download the `dist/` artifact, `npm ci` inside `desktop/` only, then
`npx electron-builder --publish always` with
`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. `macos-latest` is Apple Silicon,
which is the only architecture the mac block builds for.

Building the web app once on Linux and handing the output to every runner is
deliberate: the Windows and macOS runners never touch the root manifest, so
the web build's toolchain assumptions cannot break their packages. It is also
faster.

Linux and Windows need no secret — the default `GITHUB_TOKEN` has
`contents: write`. macOS publishes from a separate step that additionally
uses `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY`,
`APPLE_API_KEY_ID`, `APPLE_API_ISSUER` and `APPLE_TEAM_ID`, and branches
three ways on them:

| Secrets present | Result |
|---|---|
| all six | signed, notarized, `macSigned` injected, auto-updates |
| none | ad-hoc signed, Gatekeeper rejects, no auto-update, job warns |
| some | **fails the job** |

The partial case fails deliberately. Missing every secret is a decision;
missing four of six is a typo, and the cost of guessing wrong is shipping an
unsigned build to users who were meant to receive a signed one.

The unsigned path passes `--config.mac.identity=-` rather than omitting
signing altogether. macOS refuses to launch an arm64 bundle whose signature
is absent or has been invalidated by repackaging, so an ad-hoc signature is
what makes the artifact runnable at all. Gatekeeper still rejects it —
`spctl` returns `rejected` — so a user has to right-click → Open once. This
was measured, not assumed: an app signed with an Apple Development
certificate is rejected exactly the same way, which is why a development
certificate is not a usable substitute while enrollment is pending.

### Version scheme

The desktop version tracks cinny's, because this is a fork that merges upstream
regularly and a desktop build is only meaningful against the web app it wraps.
The shape is `<cinny major>.<cinny minor>.<cinny patch><our build, 2 digits>`,
with an optional `-beta.<n>`:

| Version | Means |
|---|---|
| `4.12.701` | cinny 4.12.7, our first desktop build |
| `4.12.702` | cinny 4.12.7, our second desktop build |
| `4.12.801` | cinny 4.12.8, our first desktop build on it |
| `4.12.701-beta.1` | a prerelease of `4.12.701` |

**Why not the obvious `4.12.7.1`.** Four numeric components are not valid
semver, and electron-updater is built on semver: `isUpdateAvailable` compares
with `semver.gt`, and the prerelease channel filters tags with `semver.valid`.
Both return null or false for `4.12.7.1`, so no update would ever be detected
— silently. `semver.valid('4.12.7.1')` is `null`; this was checked, not
assumed.

`4.12.7-loaf.1` was also rejected: it is valid semver but it is a *prerelease*
of 4.12.7, so every build would sort below any stable release and
`/releases/latest` would never serve one.

Folding our build number into the patch slot keeps ordering correct in the
case that matters — an upstream bump outranks any of our builds on the
previous patch (`4.12.801 > 4.12.702`) — at the cost of a convention someone
has to know, which is why it is written down here.

The root `package.json` keeps cinny's own four-part `4.12.7.1`. Nothing reads
it for update decisions, so it is unaffected.

### Version discipline

The version electron-updater compares is `desktop/package.json`'s, in the
scheme above. It is derived from the fork's root version but not equal to it
(`4.12.7.1` there, `4.12.701` here), and it is bumped by hand.

The workflow **must assert that the tag matches the package version** and
fail the job if not. A tag that disagrees publishes a release which no
installed client will ever consider an update — a silent failure that is
otherwise only discovered by a user who never gets updated.

### Test builds

Tag a semver prerelease, e.g. `desktop-v0.2.0-beta.1`. The same workflow
publishes the same artifacts, so the `.exe` is downloadable by anyone with
the link. `allowPrerelease` is irrelevant here — it only controls which tag
electron-updater walks out of the Atom feed, and the default path never
consults that feed for version selection. What actually protects a stable
client is that the release itself is flagged prerelease on GitHub: the
default channel resolves through `/releases/latest`, which filters on that
flag, not on the version string. The workflow derives the flag from the tag
(`TAG` after stripping `desktop-v`, prerelease if it contains a `-`) and sets
`EP_PRE_RELEASE` accordingly, so a `-beta` release never becomes "latest" and
a stable client is never offered it. This is the test channel; no extra
machinery is built for one.

## Out of scope

Named so they are not re-proposed: staging/beta update channels beyond the
prerelease-tag behaviour above, delta updates, rollback, an apt repository,
in-app update UI, and update telemetry.

## Known risks

1. **The Windows build has never been run.** No Windows packaging has ever
   executed, locally or in CI. Expect the first tag to fail on something
   mundane — icon format, path handling, a missing `win.icon`. Budget
   iteration; this is not a sign the design is wrong.
2. **Windows verification is second-hand.** There is no Windows machine in
   this project. A test build is handed to a friend to run, so the feedback
   loop on Windows is slower and less detailed than on Linux.
3. **The `.desktop` entry interaction is reasoned about, not observed.** The
   pinned `artifactName` is believed to make it a non-issue. Confirm during
   verification that after a real AppImage self-update the entry still points
   at a working binary.
4. **The published release tag is `v<version>`, not the pushed
   `desktop-v<version>`.** electron-builder derives the release tag from the
   package version, so pushing `desktop-v0.2.0` creates a release tagged
   `v0.2.0`, and because that tag does not exist GitHub creates it on the
   default branch. Updates still work — the client reads `tag_name` back out
   of the release. Setting `tagNamePrefix: "desktop-v"` would make them match
   but silently breaks beta-to-beta updating, because electron-updater's
   prerelease path calls `semver.valid()` on the tag and
   `desktop-v0.2.0-beta.2` is not valid semver (a bare `v` prefix is the only
   one it accepts). Deliberately left at the default.
5. **The updater assumes this repository's latest GitHub release is always a
   desktop release.** electron-updater asks for `/releases/latest`
   repository-wide with no tag filter. If a web release is ever published
   from this repo, every installed desktop client will fetch its
   `latest-linux.yml`, 404, and log `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` every
   six hours — silently, forever. The mitigation is operational: desktop
   releases and web releases cannot share this repository's release list.
   Note also that `.github/workflows/prod-deploy.yml` triggers on
   `release: [published]`; this is currently inert because GitHub does not
   start workflow runs from events created with the default `GITHUB_TOKEN`,
   but swapping in a PAT would turn a desktop tag into a production web
   deploy.
6. **The AppImage relaunch races the single-instance lock.**
   `quitAndInstall()` spawns the new AppImage before the old process exits,
   and the new process calls `app.requestSingleInstanceLock()` at
   `desktop/main.js:45` and quits outright if the old one still holds it. The
   old process almost certainly exits faster than a cold Electron boot, so
   this probably never fires — but if success criterion 4 fails
   intermittently during verification, this is the cause, and the fix is a
   short retry around the lock rather than anything in the updater.
7. **Linux arm64 has no update feed.** An arm64 client would request
   `latest-linux-arm64.yml`; the CI matrix is x64 only. Harmless while no
   arm64 AppImage is shipped.
8. **Concurrent publishing can fail one matrix leg.** All three matrix jobs
   call electron-builder's `getOrCreateRelease`; if several list releases
   before any creates one, each POSTs and the losers get an uncaught 422.
   Note explicitly that electron-builder's `already_exists` handling is on
   asset *upload* only — `createRelease()` has no such catch — so do not
   assume it self-heals. `fail-fast: false` preserves the other artifacts and
   re-running the failed job succeeds because the release then exists.
   Accepted rather than serialised with `max-parallel: 1`, because the
   failure is loud and re-runnable. Adding the macOS leg widens this window:
   three racers rather than two, and the macOS leg is much the slowest
   because notarization blocks on Apple, so in practice it arrives last and
   finds the release already made.

## Success criteria

Ordered; each depends on the previous.

1. `desktop-v*` tag produces a GitHub Release containing an AppImage, a
   Windows `.exe`, a macOS `.dmg` **and** `.zip`, plus `latest.yml`,
   `latest-linux.yml` and `latest-mac.yml`, not as a draft. A missing
   `.zip` or `latest-mac.yml` means macOS will never update.
2. A mismatched tag/version fails the workflow instead of publishing.
3. A running AppImage from release N detects release N+1 and shows the
   restart dialog.
4. Accepting the dialog installs N+1 and relaunches into it.
5. After that relaunch, `loaf://` still resolves — sign-in from a cold start
   still completes via the system browser.
6. The same detect/install/relaunch cycle works on Windows.
7. A `-beta` tagged release is **not** offered to a client running a stable
   build.
8. Added 2026-09-20 for macOS, and **only once the six secrets exist**: the
   downloaded DMG opens with no Gatekeeper warning on a machine that has
   never seen the app — `spctl -a -vvv -t install` on the mounted app
   reports `accepted` / `Notarized Developer ID`, and `stapler validate`
   succeeds. Until then the unsigned build is expected to report `rejected`,
   and that is not a regression.
9. A voice and a video call both carry audio and video in the **signed**
   build specifically. The hardened runtime is what makes this a separate
   criterion: an unsigned local build exercises none of the entitlements,
   so this cannot be inferred from development testing.
10. The same detect/install/relaunch cycle works on macOS.

**Verification cannot be delegated to a subagent.** Criteria 3-10 require two
real releases and a human watching a window. Any implementing agent reports
them as NOT VERIFIED. Criteria 8 and 9 are the exception worth attempting
locally first: a Mac is the development machine, so `npx electron-builder
--mac` with the certificate in the login keychain proves the signature, the
notarization and the call path without spending a release on it.
