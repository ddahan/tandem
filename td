#!/usr/bin/env sh
# The one command for working on Tandem: ./td <command>. Everything runs in Docker (there is
# no Node on the Mac). Dependencies are installed on first use and after lockfile changes.
set -eu
cd "$(dirname "$0")"

usage() {
  cat <<USAGE
Usage: ./td <command> [args]

  start             build and start the app in the background (http://localhost:3864)
  stop              stop the app
  logs              follow the app's output
  dev               run the dev servers with reload (http://localhost:3010), Ctrl-C stops them
  check             format check, lint, builds, type checks and unit tests (definition of done)
  test [package]    unit tests, of one package (server, web, shared, cli) or of all
  e2e               end-to-end tests (Playwright, against a production build)
  typecheck         type checks
  build             production builds
  release           the app people install (JavaScript, run by their Node), into app/tandem,
                    checked on the oldest supported Node and the pinned one (publish: commit it,
                    see README)
  node-pin <ver>    the Node the installer downloads when there is none (app/node.env)
  format            format every file (Oxfmt)
  lint              lint every file (Oxlint)
  pnpm <args>       any pnpm command, in the toolchain container
  setup             rebuild the toolchain image and reinstall dependencies
USAGE
}

dev_compose() { docker compose -f compose.dev.yaml "$@"; }

toolchain() {
  docker image inspect tandem-dev-tools > /dev/null 2>&1 || dev_compose build node
}

pnpm_() {
  toolchain
  dev_compose --progress quiet run --rm --no-deps node pnpm "$@"
}

prepare() {
  stamp=node_modules/.td-installed
  if [ ! -f "$stamp" ] || [ pnpm-lock.yaml -nt "$stamp" ] || [ pnpm-workspace.yaml -nt "$stamp" ]; then
    pnpm_ install
    touch "$stamp"
  fi
}

cmd="${1:-}"
[ $# -gt 0 ] && shift

case "$cmd" in
  start) docker compose up -d --build "$@" && echo "Tandem runs on http://localhost:3864" ;;
  stop) docker compose down ;;
  logs) docker compose logs -f ;;
  dev)
    prepare
    toolchain
    trap true INT
    status=0
    dev_compose --profile dev up --remove-orphans || status=$?
    dev_compose --profile dev down
    exit "$status"
    ;;
  check | format | lint | typecheck | build)
    prepare
    pnpm_ "$cmd" "$@"
    ;;
  test)
    prepare
    if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
      package="$1"
      shift
      pnpm_ --filter "@tandem/$package" test "$@"
    else
      pnpm_ test "$@"
    fi
    ;;
  e2e)
    prepare
    pnpm_ --filter @tandem/web build
    pnpm_ --filter @tandem/web test:e2e "$@"
    ;;
  pnpm)
    prepare
    pnpm_ "$@"
    ;;
  release)
    prepare
    pnpm_ --filter @tandem/web build
    pnpm_ --filter @tandem/standalone package
    # The app people install, committed in app/tandem/ (some networks only let a repository's
    # ZIP through): JavaScript and the web app, run by the computer's own Node.
    rm -rf app/tandem
    cp -R packages/standalone/dist/tandem app/tandem
    # Checked on the oldest Node it supports (see nodeSupported) and on the one the installer
    # downloads (app/node.env), in Docker.
    for node in 22.16 "$(sed -n 's/^NODE_VERSION=//p' app/node.env)"; do
      docker run --rm -v "$PWD/app/tandem:/app:ro" \
        -v "$PWD/packages/standalone/scripts/smoke.mjs:/smoke.mjs:ro" \
        "node:$node-slim" node /smoke.mjs /app
    done
    echo "app/tandem updated ($(du -sh app/tandem | cut -f 1)): commit it to publish this version."
    ;;
  node-pin)
    # The checksums of the four builds the installer can download, from nodejs.org.
    version="${1:?Usage: ./td node-pin <version>, e.g. 24.22.0}"
    sums="$(curl -fsS "https://nodejs.org/dist/v$version/SHASUMS256.txt")"
    {
      sed -n '/^NODE_VERSION=/q;p' app/node.env
      echo "NODE_VERSION=$version"
      for build in darwin-arm64 darwin-x64 linux-arm64 linux-x64; do
        sum="$(printf '%s\n' "$sums" | awk -v f="node-v$version-$build.tar.gz" '$2 == f { print $1 }')"
        [ -n "$sum" ] || { echo "No $build build for Node $version." >&2; exit 1; }
        echo "NODE_SHA256_$(echo "$build" | tr - _)=$sum"
      done
    } > app/node.env.new
    mv app/node.env.new app/node.env
    echo "app/node.env: Node $version. Run ./td release to check the app on it."
    ;;
  setup)
    dev_compose build node
    pnpm_ install
    touch node_modules/.td-installed
    ;;
  "" | help | -h | --help) usage ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
