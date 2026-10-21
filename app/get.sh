#!/bin/sh
# Kept for the one-line install published with Tandem 0.5.1 (curl … app/get.sh | sh, from
# raw.githubusercontent.com, which company proxies often block). It does what the one-line
# install now does (README › Install): GitHub's archive of the repository, unpacked in /tmp,
# then its installer, with the same options and arguments.

# All in a function, run on the last line: a download cut short runs nothing.
main() {
  set -eu
  rm -rf /tmp/tandem-main
  curl -fL https://github.com/ddahan/tandem/archive/refs/heads/main.tar.gz | tar -xz -C /tmp
  exec sh /tmp/tandem-main/app/install.sh "$@"
}

main "$@"
