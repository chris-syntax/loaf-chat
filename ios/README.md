# Loaf Chat for iOS

A WKWebView shell around the web app in `src/`, which it bundles and serves
from a loopback server on `127.0.0.1:8437`. Design and the reasoning behind
it: `docs/superpowers/specs/2026-09-20-ios-client-design.md`.

## Run it

```nu
mise install              # node, xcodegen
npm ci
mise run ios-bundle       # build the web app into ios/Resources/dist
ios/build-and-run         # generate the project, build, launch on a simulator
```

Or open `ios/LoafChat.xcodeproj` in Xcode after `mise run ios-bundle`.

Changes to `src/` need `mise run ios-bundle` again before they show up in
the app; the shell serves a copy, not the live tree.

## The Xcode project is generated

`ios/project.yml` is the source of truth. After editing it:

```nu
mise x -- xcodegen --spec ios/project.yml
```

Commit both. The `.xcodeproj` is checked in because Xcode Cloud builds from
the repo as-is and never runs XcodeGen; hand edits to it are lost on the
next generate.

## Tests

```nu
ios/run-tests             # BundleServer and SSOFlow, as a plain macOS binary
npx vitest run            # the web side, including the iOS layout helpers
```

## Simulator gotcha

If tapping the message box shows nothing, the Simulator is treating your Mac
keyboard as a hardware keyboard. Turn off I/O → Keyboard → Connect Hardware
Keyboard (⇧⌘K). The app removes WebKit's form accessory bar, so in that mode
nothing appears at all, which looks like a bug and isn't.

## Releases

Xcode Cloud builds on push and ships to TestFlight internal testers.
`ci_scripts/ci_post_clone.sh` stages the web bundle first, since it is
gitignored.
