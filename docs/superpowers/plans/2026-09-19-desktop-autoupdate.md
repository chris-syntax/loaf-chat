# Desktop Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A packaged Loaf Chat AppImage or Windows installer checks for,
downloads and installs its own updates from GitHub Releases.

**Architecture:** A new `desktop/updater.js` holds a pure platform-guard
function plus the electron-updater glue, wired into `main.js` with one call.
`desktop/package.json` drops the `.deb` target, pins a version-less AppImage
filename, and gains a GitHub publish block. A new tag-triggered workflow
builds the web app once on Linux and packages it on both Linux and Windows.

**Tech Stack:** Electron 44, electron-builder 26, electron-updater, vitest,
GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-desktop-autoupdate-design.md`

## Global Constraints

- **Nothing under `src/` changes.** This is packaging work, as in the parent
  desktop spec. The update prompt is a native Electron dialog for this reason.
- **Dependencies go in `desktop/package.json`, never the root manifest.** This
  fork merges upstream cinny regularly and the root manifest is a recurring
  conflict point.
- **`desktop/` is CommonJS** (`"type": "commonjs"`). Use `require`, not
  `import`. Test files are `.mjs` and use ESM `import` — see the existing
  `desktop/resolve.test.mjs`.
- **Tests run with vitest** from the repository root. `vitest.config.ts`
  includes `desktop/**/*.test.mjs`.
- **GitHub Actions are pinned to a commit SHA** with the version in a trailing
  comment. Follow this; do not use floating tags.
- **The AppImage artifact name must contain no version and no space:**
  `LoafChat.AppImage`. This is load-bearing — see Task 2.
- **Targets are AppImage and Windows NSIS only.** No `.deb`. macOS is not
  built in CI and the updater refuses to run on darwin.

---

### Task 1: The updater module

**Files:**
- Create: `desktop/updater.js`
- Create: `desktop/updater.test.mjs`
- Modify: `desktop/package.json` (add the `electron-updater` dependency)
- Modify: `desktop/main.js` (two lines: require and call)
- Test: `desktop/updater.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `shouldAutoUpdate({ isPackaged: boolean, platform: string, appImage: string|undefined }) -> boolean`
  - `initAutoUpdate() -> void`
  Both exported from `desktop/updater.js` via `module.exports`.

**Why the split:** `shouldAutoUpdate` is pure so it can be tested in plain
node without an Electron runtime. This mirrors the existing
`resolve.js` / `main.js` split — pure logic tested, Electron glue verified by
a human. `initAutoUpdate` is not unit tested; it is covered by the manual
verification in Task 4.

- [ ] **Step 1: Write the failing test**

Create `desktop/updater.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { shouldAutoUpdate } from './updater.js';

describe('shouldAutoUpdate', () => {
  it('never runs in development', () => {
    // A dev run has no packaged app and no update feed; electron-updater
    // throws rather than no-ops if asked.
    expect(
      shouldAutoUpdate({ isPackaged: false, platform: 'win32', appImage: undefined })
    ).toBe(false);
    expect(
      shouldAutoUpdate({ isPackaged: false, platform: 'linux', appImage: '/tmp/LoafChat.AppImage' })
    ).toBe(false);
  });

  it('runs on packaged Windows', () => {
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'win32', appImage: undefined })
    ).toBe(true);
  });

  it('runs on Linux only inside an AppImage', () => {
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'linux', appImage: '/opt/LoafChat.AppImage' })
    ).toBe(true);
    // An extracted AppImage run directly. There is no AppImage file to
    // replace, so the AppImage updater has nothing to work with.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'linux', appImage: undefined })
    ).toBe(false);
  });

  it('never runs on macOS', () => {
    // Squirrel.Mac refuses unsigned updates and no configuration works
    // around it. Attempting a check surfaces an error to no purpose.
    expect(
      shouldAutoUpdate({ isPackaged: true, platform: 'darwin', appImage: undefined })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run desktop/updater.test.mjs`
Expected: FAIL — the file `desktop/updater.js` does not exist yet, so the
import cannot be resolved.

- [ ] **Step 3: Install electron-updater**

Run from the repository root:

```bash
cd desktop && npm install --save electron-updater
```

`--save`, not `--save-dev`: electron-updater runs inside the shipped app, so
it must be a production dependency. `electron` and `electron-builder` stay in
`devDependencies` — they are build-time only. This also updates
`desktop/package-lock.json`, which is what CI's `npm ci` reads.

- [ ] **Step 4: Write the implementation**

Create `desktop/updater.js`:

```js
// electron and electron-updater are required inside initAutoUpdate(), not at
// module scope, so this file can be imported by the unit test in a plain node
// process where neither module can load.

const SIX_HOURS = 6 * 60 * 60 * 1000;

// Whether electron-updater can do anything useful in this process. Every
// false branch is a configuration where calling it would throw or mislead.
function shouldAutoUpdate({ isPackaged, platform, appImage }) {
  if (!isPackaged) return false;
  if (platform === 'darwin') return false;
  if (platform === 'linux') return Boolean(appImage);
  return platform === 'win32';
}

function initAutoUpdate() {
  const { app, dialog } = require('electron');

  if (
    !shouldAutoUpdate({
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImage: process.env.APPIMAGE,
    })
  ) {
    return;
  }

  const { autoUpdater } = require('electron-updater');

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Loaf Chat ${info.version} is ready to install.`,
      detail: 'Restart to finish updating.',
    });
    // Declining is not a cancellation: the download is already staged and
    // electron-updater installs it on the next quit by default.
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // A failed check must never reach the user, block startup, or interrupt a
  // call. There is no retry logic; the next tick is the retry.
  autoUpdater.on('error', (error) => {
    console.error('[updater]', error);
  });

  // checkForUpdates() both emits 'error' and rejects. The handler above does
  // the reporting; this only keeps the rejection from being unhandled.
  const check = () => autoUpdater.checkForUpdates().catch(() => {});

  check();
  // A chat client stays open for days. Checking only at launch means a
  // machine that is never restarted is never updated.
  setInterval(check, SIX_HOURS);
}

module.exports = { shouldAutoUpdate, initAutoUpdate };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run desktop/updater.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the whole desktop suite**

Run: `npx vitest run desktop/`
Expected: PASS — 12 tests across 2 files (8 existing in `resolve.test.mjs`,
4 new).

- [ ] **Step 7: Wire it into main.js**

In `desktop/main.js`, add the require next to the existing local requires
near the top of the file:

```js
const { ensureDesktopEntry } = require('./linux-protocol');
const { initAutoUpdate } = require('./updater');
```

Then inside the `app.whenReady().then(() => { ... })` callback, add the call
immediately after `createWindow();` and before the `app.on('activate', ...)`
registration:

```js
  createWindow();

  // Guards itself: no-ops in dev, on macOS, and on any Linux run that is not
  // an AppImage. Called after the window exists so the update dialog can
  // never precede it.
  initAutoUpdate();
```

- [ ] **Step 8: Verify the app still starts**

Run from the repository root:

```bash
npm run build && cd desktop && npm start
```

Expected: the window opens and reaches Loaf Chat as before. `initAutoUpdate`
returns immediately because `app.isPackaged` is false in a dev run — no
network request, no dialog, nothing in the terminal from `[updater]`.

**If you are an agent: you cannot verify this step.** Report it as NOT
VERIFIED and leave it to the user.

- [ ] **Step 9: Commit**

```bash
git add desktop/updater.js desktop/updater.test.mjs desktop/main.js \
        desktop/package.json desktop/package-lock.json
git commit -m "feat(desktop): check for and install updates on AppImage and Windows

Guards itself off in dev, on macOS, and on any Linux run that is not an
AppImage — each is a configuration where electron-updater throws rather
than no-ops. macOS is excluded because Squirrel.Mac refuses unsigned
updates, which is a signing problem, not a configuration one.

Checks at startup and every six hours: a chat client stays open for days,
so launch-only checking means a machine that is never restarted is never
updated."
```

---

### Task 2: Packaging configuration

**Files:**
- Modify: `desktop/package.json` (the `build` block)

**Interfaces:**
- Consumes: `electron-updater` as a production dependency, added in Task 1.
- Produces: an AppImage named exactly `LoafChat.AppImage`, a `publish` block
  that Task 3's workflow relies on, and `latest-linux.yml` in the build
  output.

Three changes to the `build` block, all in `desktop/package.json`.

- [ ] **Step 1: Drop the deb target**

Replace the `linux` block:

```json
    "linux": {
      "target": [
        "AppImage"
      ],
      "category": "Network"
    },
```

The `.deb` is removed rather than kept as a non-updating download. It never
auto-updated — that needs an apt repository, which is separate infrastructure
nobody asked for — and shipping a package that silently rots on users'
machines is worse than not shipping it.

Leave the `author` field at the top of the file alone. It was added for deb
packaging but electron-builder is happier with it present, and removing it is
churn for no gain.

Leave the `mac` block alone too. macOS is blocked on signing, not on
configuration, and a Mac is available if that ever changes. Task 3 simply
does not build it.

- [ ] **Step 2: Pin the AppImage filename**

Add an `appImage` block inside `build`, as a sibling of `linux`:

```json
    "appImage": {
      "artifactName": "LoafChat.AppImage"
    },
```

**This is the one config change carrying real risk, so do not "improve" the
name.** `desktop/linux-protocol.js` writes
`~/.local/share/applications/loaf-chat.desktop` containing an absolute
`Exec=` path to the running AppImage, and that desktop entry is what routes
`loaf://` callbacks back from the system browser — it is what makes SSO work.
If a self-update wrote the new build to a different path, that entry would
point at a deleted file and sign-in would break until the next launch
rewrote it. A version-less name makes the path immovable.

No space in the name either: it appears in the zsync update feed URL, and
unencoded spaces there are an avoidable wrinkle.

- [ ] **Step 3: Add the publish block**

Add inside `build`, as a sibling of `appImage`:

```json
    "publish": {
      "provider": "github",
      "owner": "chris-syntax",
      "repo": "loaf-chat",
      "releaseType": "release"
    },
```

`releaseType` must be set explicitly. electron-builder defaults to **draft**,
and a draft release is invisible to non-collaborators and unreadable by
electron-updater — a first release left as a draft serves nobody and fails
silently.

The repository is public, so no token is shipped to clients.

- [ ] **Step 4: Add updater.js to the packaged files**

The `files` array is an explicit allowlist. Add the new module:

```json
    "files": [
      "main.js",
      "resolve.js",
      "linux-protocol.js",
      "updater.js",
      "package.json"
    ],
```

- [ ] **Step 5: Build locally and check the output**

Run from the repository root:

```bash
npm run build
cd desktop && npm run dist
ls release/
```

Expected in `desktop/release/`:
- `LoafChat.AppImage` — exactly this name, no version, no space
- `latest-linux.yml` — the update feed electron-updater reads
- no `.deb` file

- [ ] **Step 6: Verify electron-updater actually got packaged**

electron-builder computes the production dependency tree and bundles it, but
the `files` allowlist makes this worth confirming rather than assuming — a
missing `electron-updater` would fail only at runtime, in a packaged build,
on a user's machine.

```bash
cd desktop && npx electron-builder --dir
ls release/linux-unpacked/resources/app/node_modules/ | grep electron-updater
```

Expected: `electron-updater` is listed. If it is not, add
`"node_modules/**/*"` to the `files` array and rebuild.

- [ ] **Step 7: Commit**

```bash
git add desktop/package.json
git commit -m "build(desktop): publish to GitHub Releases, drop deb, pin AppImage name

The AppImage filename is deliberately version-less. linux-protocol.js
writes a .desktop entry with an absolute Exec= path, and that entry routes
loaf:// callbacks back from the system browser, so a self-update that moved
the binary would break SSO until the next launch rewrote it.

releaseType is set explicitly because electron-builder defaults to draft,
which non-collaborators cannot see and electron-updater cannot read.

The deb is dropped rather than shipped as a package that never updates;
that would need an apt repository."
```

---

### Task 3: Release workflow

**Files:**
- Create: `.github/workflows/desktop-release.yml`

**Interfaces:**
- Consumes: the `publish` block and `LoafChat.AppImage` artifact name from
  Task 2; `desktop/package.json`'s `version` field.
- Produces: a GitHub Release per `desktop-v*` tag containing the AppImage,
  the Windows `.exe`, `latest.yml` and `latest-linux.yml`.

- [ ] **Step 1: Action SHAs — already resolved, nothing to look up**

This repository pins every action to a commit SHA. All four SHAs in Step 2 are
resolved and correct as written:

- `actions/checkout` and `actions/setup-node` and `actions/upload-artifact` are
  copied from `.github/workflows/build-pull-request.yml`.
- `actions/download-artifact` was not previously used here.
  `37930b1c2abaa49bbe596cd826c3c89aef350131` is v7.0.0, resolved from the
  public GitHub API. The method was validated by resolving
  `actions/upload-artifact` v7.0.1 the same way and getting
  `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, byte-identical to the pin already
  in this repo. Both refs are `type: commit`, so they are valid `uses:` pins
  rather than annotated-tag objects.

Do not re-look these up and do not make network calls.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/desktop-release.yml`:

```yaml
name: Desktop release

on:
  push:
    tags:
      - 'desktop-v*'

permissions:
  contents: write

jobs:
  build-web:
    name: Build web app
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - name: Setup node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: ".node-version"
          package-manager-cache: false
      # A tag that disagrees with the packaged version publishes a release
      # no installed client will ever consider an update — a silent failure
      # otherwise discovered only by a user who never gets updated.
      - name: Check tag matches desktop version
        run: |
          TAG="${GITHUB_REF_NAME#desktop-v}"
          PKG="$(node -p "require('./desktop/package.json').version")"
          if [ "$TAG" != "$PKG" ]; then
            echo "Tag ${GITHUB_REF_NAME} implies version ${TAG}, but desktop/package.json is ${PKG}" >&2
            exit 1
          fi
      - name: Install dependencies
        run: npm ci
      - name: Build app
        env:
          NODE_OPTIONS: '--max_old_space_size=4096'
        run: npm run build
      - name: Upload web build
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: web-dist
          path: dist
          retention-days: 1

  package:
    name: Package (${{ matrix.os }})
    needs: build-web
    runs-on: ${{ matrix.os }}
    strategy:
      # A Windows failure must not throw away a good Linux artifact.
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - name: Setup node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: ".node-version"
          package-manager-cache: false
      # The web app is built once, on Linux, and handed to both runners. The
      # Windows runner never touches the root manifest, so npm's known
      # platform-specific optional-dependency problems with a Linux-generated
      # lockfile cannot break the Windows package.
      - name: Download web build
        uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7.0.0
        with:
          name: web-dist
          path: dist
      - name: Install desktop dependencies
        working-directory: desktop
        run: npm ci
      - name: Package and publish
        working-directory: desktop
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --publish always
```

No new secret is needed: the default `GITHUB_TOKEN` has `contents: write`,
granted by the `permissions` block.

- [ ] **Step 3: Check the workflow parses**

```bash
npx --yes js-yaml .github/workflows/desktop-release.yml > /dev/null && echo "valid yaml"
```

Expected: `valid yaml`. This catches indentation mistakes without pushing a
tag; it does not validate the Actions schema.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/desktop-release.yml
git commit -m "ci(desktop): build and publish releases on desktop-v* tags

Builds the web app once on Linux and hands dist/ to both packagers, so the
Windows runner never runs npm ci against the root manifest — a
Linux-generated lockfile and npm's platform-specific optional dependencies
are a known bad combination.

Asserts the tag matches desktop/package.json's version. A mismatch would
publish a release that no installed client considers an update, which fails
silently and is discovered only by a user who never gets updated."
```

---

### Task 4: Verification — user-run, not agent-run

**Files:** none. This task changes nothing.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: confirmation, or a defect report.

**No agent can perform any step in this task.** It needs two real releases,
a Windows machine that is not in this project, and a human watching a window.
An implementing agent reports every step here as NOT VERIFIED.

- [ ] **Step 1: Publish a prerelease**

Set `desktop/package.json`'s `version` to `0.2.0-beta.1` (it is `0.1.0`
today), commit, then:

```bash
git tag desktop-v0.2.0-beta.1
git push origin desktop-v0.2.0-beta.1
```

Expected: the workflow runs both jobs. The GitHub Release contains
`LoafChat.AppImage`, a Windows `.exe`, `latest.yml` and `latest-linux.yml`,
and is **not** a draft.

- [ ] **Step 2: Confirm the version assertion works**

Push a deliberately mismatched tag, e.g. `desktop-v9.9.9`, and confirm the
`build-web` job fails at "Check tag matches desktop version" and nothing is
published. Delete the tag afterwards.

- [ ] **Step 3: Install the prerelease and run it**

Download `LoafChat.AppImage`, make it executable, run it. Confirm the app
still works as it did before: avatars render, login survives a restart,
`loaf://` sign-in completes through the system browser.

- [ ] **Step 4: Publish a second release and watch it update**

Bump to `0.2.0`, tag `desktop-v0.2.0`, push. Leave the beta AppImage running.

Expected: within the first check (or the next six-hour tick), the "Update
ready" dialog appears. Choosing "Restart now" installs and relaunches into
0.2.0.

- [ ] **Step 5: Confirm SSO still works after the self-update**

This is the step the pinned artifact name exists for. After the update has
relaunched the app, fully quit it, then trigger a cold `loaf://` sign-in from
the browser.

Expected: the running AppImage is still at the same path, the `.desktop`
entry still points at a real file, and sign-in completes.

- [ ] **Step 6: Windows**

Hand the `.exe` from the beta release to your friend. Have them install and
run it, then publish the next release and confirm they get the dialog and
that accepting it installs and relaunches.

- [ ] **Step 7: Confirm the prerelease channel is separate**

With a client running stable `0.2.0`, publish `desktop-v0.3.0-beta.1`.

Expected: the stable client is **not** offered the beta, because
`allowPrerelease` is off by default in electron-updater.
