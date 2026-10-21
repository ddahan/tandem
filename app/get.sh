#!/bin/sh
# Installs (or updates) Tandem in one command, from its latest release on GitHub:
#   curl -fsSL https://raw.githubusercontent.com/ddahan/tandem/main/app/get.sh | sh
# It downloads the release's source archive (the app is in it, built), unpacks it in a
# temporary folder and runs its app/install.sh, which asks its questions on the terminal and
# takes the same options (environment variables, --uninstall after `sh -s --`). Where GitHub
# can't be reached (a company proxy), download the release by hand instead: see the README.
#
# Options (environment): TANDEM_VERSION (a release, e.g. 0.5.0; default the latest), and
# install.sh's.

# All in a function, run on the last line: a download cut short runs nothing.
main() {
  set -eu
  repo="ddahan/tandem"
  releases="https://github.com/$repo/releases"

  for tool in curl tar; do
    command -v "$tool" > /dev/null 2>&1 || {
      printf 'Tandem: this installer needs %s.\n' "$tool" >&2
      exit 1
    }
  done
  unreachable() {
    printf 'Tandem: %s couldn'"'"'t be downloaded (no network, or a proxy blocks GitHub).\n' "$1" >&2
    printf 'Download the latest release by hand instead (%s: its source code ZIP),\n' "$releases" >&2
    printf 'unzip it, then run: sh <its folder>/app/install.sh\n' >&2
    exit 1
  }

  # The latest release: where releases/latest leads (no API: it has a rate limit).
  if [ -n "${TANDEM_VERSION:-}" ]; then
    tag="v${TANDEM_VERSION#v}"
  else
    latest="$(curl -fsSL --connect-timeout 15 -o /dev/null -w '%{url_effective}' "$releases/latest")" ||
      unreachable "$releases/latest"
    tag="${latest##*/tag/}"
    case "$tag" in
      v[0-9]*) ;;
      *) unreachable "$releases/latest" ;;
    esac
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  archive="https://github.com/$repo/archive/refs/tags/$tag.tar.gz"
  printf 'Downloading Tandem %s…\n' "${tag#v}"
  curl -fL --progress-bar --connect-timeout 15 -o "$tmp/tandem.tar.gz" "$archive" ||
    unreachable "$archive"
  tar -xzf "$tmp/tandem.tar.gz" -C "$tmp"
  installer="$(echo "$tmp"/*/app/install.sh)"
  [ -f "$installer" ] || {
    printf 'Tandem: no app/install.sh in %s.\n' "$archive" >&2
    exit 1
  }
  # Not exec: the temporary folder goes when the installer is done. TANDEM_GET tells it how it
  # was run, for the commands it shows (update, uninstall).
  TANDEM_GET=1 sh "$installer" "$@"
}

main "$@"
