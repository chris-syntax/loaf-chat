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
| macOS DMG | not built in CI | no |

### Why the two exclusions

**`.deb` is dropped entirely.** It never auto-updated — electron-updater has
no path for it; that needs an apt repository, which is separate
infrastructure nobody asked for. Rather than ship a package that silently
rots on users' machines, we stop shipping it. Its `linux.target` entry is
removed.

The `author` field in `desktop/package.json` was added for deb packaging
(commit cedba7c). It stays — electron-builder is happier with it present and
removing it is churn for no gain.

**macOS is blocked, not deferred by preference.** Squirrel.Mac refuses
unsigned updates and no configuration works around it; it needs an Apple
Developer Program membership first. The `mac` build block stays in
`desktop/package.json` — it costs nothing and a Mac is available if that
changes — but CI does not build it and the updater refuses to run on darwin.

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
if (process.platform === 'darwin') return;                          // unsigned
```

Each one prevents electron-updater from throwing on a configuration where it
cannot work. The Linux guard now covers only "someone extracted the AppImage
and ran the binary directly", but it is one line and it is what makes the
"inert everywhere else" claim true.

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

**Job 2 — `package` (matrix: ubuntu-latest, windows-latest).** Download the
`dist/` artifact, `npm ci` inside `desktop/` only, then
`npx electron-builder --publish always` with
`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Building the web app once on Linux and handing the output to both runners is
deliberate: the Windows runner never touches the root manifest, so the web
build's toolchain assumptions cannot break the Windows package. It is also
faster.

No new secret is required — the default `GITHUB_TOKEN` has `contents: write`.

### Version discipline

The version electron-updater compares is `desktop/package.json`'s (currently
`0.1.0`). It is independent of the fork's root version (`4.12.7.1`) and is
bumped by hand.

The workflow **must assert that the tag matches the package version** and
fail the job if not. A tag that disagrees publishes a release which no
installed client will ever consider an update — a silent failure that is
otherwise only discovered by a user who never gets updated.

### Test builds

Tag a semver prerelease, e.g. `desktop-v0.2.0-beta.1`. The same workflow
publishes the same artifacts, so the `.exe` is downloadable by anyone with
the link, but electron-updater will not offer it to clients on a stable build
because `allowPrerelease` is off by default. This is the test channel; no
extra machinery is built for one.

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

## Success criteria

Ordered; each depends on the previous.

1. `desktop-v*` tag produces a GitHub Release containing an AppImage, a
   Windows `.exe`, `latest.yml` and `latest-linux.yml`, not as a draft.
2. A mismatched tag/version fails the workflow instead of publishing.
3. A running AppImage from release N detects release N+1 and shows the
   restart dialog.
4. Accepting the dialog installs N+1 and relaunches into it.
5. After that relaunch, `loaf://` still resolves — sign-in from a cold start
   still completes via the system browser.
6. The same detect/install/relaunch cycle works on Windows.
7. A `-beta` tagged release is **not** offered to a client running a stable
   build.

**Verification cannot be delegated to a subagent.** Criteria 3-7 require two
real releases and a human watching a window. Any implementing agent reports
them as NOT VERIFIED.
