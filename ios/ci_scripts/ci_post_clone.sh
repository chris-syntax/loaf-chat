#!/bin/bash
# Xcode Cloud runs this after cloning and before building. It exists for one
# reason: the app bundles the web build (ios/Resources/dist), which is
# gitignored, so every cloud build has to produce it first.
#
# Xcode Cloud images ship Homebrew but not our toolchain, so mise comes from
# Homebrew and node from mise, pinned by the repo's own mise.toml -- the same
# version the Docker builder and local builds use. pnpm and xcodegen are
# excluded: element-call is vendored as a tarball, and the generated
# .xcodeproj is committed, so neither is needed here.
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"
export MISE_DISABLE_TOOLS=pnpm,xcodegen

brew install mise
mise trust --yes
mise install node

mise x -- npm ci
mise run ios-bundle
