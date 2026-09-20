# Loaf Chat

A [Matrix] client for [loaf.moe](https://loaf.moe), available on the web and as a
desktop app for Windows, macOS and Linux.

Loaf Chat is a **fork of [Cinny](https://github.com/cinnyapp/cinny)** by Ajay
Bura and contributors. It is free software under the
[GNU Affero General Public License v3](LICENSE), the same license as Cinny.
It is not affiliated with or endorsed by the Cinny project.

[Matrix]: https://matrix.org

## Download

- **Web:** <https://loaf.moe>
- **Desktop:** installers for Windows, macOS and Linux (AppImage) are on the
  [GitHub releases page](https://github.com/chris-syntax/loaf-chat/releases).
  The desktop app updates itself.

## Source code

The complete corresponding source for Loaf Chat is this repository:
<https://github.com/chris-syntax/loaf-chat>. The same link is in the app under
Settings → About. If you use a build of Loaf Chat over a network, you are
entitled to its source under section 13 of the AGPL; that link is where to get
it.

## Relationship to Cinny

Loaf Chat began on 2026-07-05 as a fork of Cinny at v4.12.7 and is versioned
against Cinny's release (Loaf Chat `4.12.7.1` is the first Loaf Chat release
based on Cinny `4.12.7`). Upstream is available at
<https://github.com/cinnyapp/cinny>; it is configured as the `upstream` remote
when merging its changes.

### Modifications

As required by AGPL section 5(a), this notice states that Cinny has been
modified. The changes since 2026-07-05 are, in summary:

- **Rebrand.** Cinny's name, logo and copy are replaced with Loaf Chat's.
  Cinny's name and logo are not used to describe this fork.
- **Single homeserver.** [`config.json`](config.json) is pinned to `loaf.moe`,
  and the homeserver picker is hidden.
- **Theme.** Custom colour themes in [`src/colors.css.ts`](src/colors.css.ts).
- **GIF picker.** A Discord-style GIF picker in the emoji board, backed by a
  same-origin `gif-bridge` service discovered through the homeserver's
  `moe.loaf.gif` well-known entry.
- **Calls.** Extra screen-share quality controls in the call UI, and a
  modified build of Element Call (see below).
- **Desktop app.** An Electron shell in [`desktop/`](desktop) with code
  signing, notarization and auto-update. Design notes are in
  [`docs/superpowers/specs`](docs/superpowers/specs).

The git history is the authoritative record of every change, with dates and
authors. Diff against upstream with:

```nu
git fetch upstream
git diff (git merge-base HEAD upstream/dev) HEAD
```

## Building and hosting

Loaf Chat is a static web app. Build it, then serve `dist/` with any web
server:

```nu
npm ci
npm run build
```

- Default homeserver and related settings are in [`config.json`](config.json).
- The app uses client-side routing, so the server must redirect unknown paths
  to `index.html`. Example configurations: [netlify](netlify.toml),
  [nginx](contrib/nginx/cinny.domain.tld.conf), [caddy](contrib/caddy/caddyfile).
  If you can't configure redirects, set `hashRouter.enabled` to `true` in
  `config.json`; URLs then contain `/#/` and no server rules are needed.
- To serve from a subdirectory, set `base` in
  [`build.config.ts`](build.config.ts) and rebuild. For `https://example.com/app`,
  use `base: '/app'`.
- A [`Dockerfile`](Dockerfile) is included.

Developer notes are in [HACKING.md](HACKING.md). Node and pnpm versions are
pinned in [`mise.toml`](mise.toml).

If you host a modified version of Loaf Chat for other people, AGPL section 13
requires that you offer those users the source of *your* modified version. Update
the source link in [`About.tsx`](src/app/features/settings/about/About.tsx) to
point to it.

## Element Call

Voice and video calls run in [Element Call](https://github.com/element-hq/element-call),
embedded in an iframe. Loaf Chat ships a **modified build** of it, committed as
[`vendor/element-call-embedded-28da7a19.tgz`](vendor). Element Call is licensed
under AGPL-3.0 (Element also offers it under a separate commercial license, which
Loaf Chat does not use). The tarball is produced by
[`mise-tasks/vendor-element-call`](mise-tasks/vendor-element-call); the number in
its name is the git revision of the modified source it was built from.

## Contributing

Issues and pull requests for Loaf Chat belong in
[this repository](https://github.com/chris-syntax/loaf-chat/issues), not in
Cinny's; please don't report Loaf Chat bugs to Cinny.

## License

Loaf Chat is licensed under the **GNU Affero General Public License, version 3
only** (AGPL-3.0-only). The full text is in [LICENSE](LICENSE), or at
<https://www.gnu.org/licenses/agpl-3.0.html>.

```
Cinny
Copyright © 2024–present Ajay Bura and Cinny contributors
https://cinny.in

Loaf Chat modifications
Copyright © 2026–present Chris Thomas
https://loaf.moe
```

This program is distributed in the hope that it will be useful, but **without
any warranty**; without even the implied warranty of merchantability or fitness
for a particular purpose. See the license for details.

Third-party dependencies, including Element Call, are distributed under their
own licenses.
