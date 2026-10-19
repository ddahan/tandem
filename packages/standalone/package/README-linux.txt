Tandem for Linux
================

Installs Tandem from this package: no network, no Docker, no Node, no root.
Everything goes in your home folder.

1. Unpack it:  tar -xzf tandem-linux.tar.gz
2. Run:        sh tandem-linux/install.sh
3. Answer where your notes live.

Tandem then starts at login (a systemd user service) and opens http://localhost:3000. To install
it as an app, use your browser's install button.

Update: unpack the latest tandem-linux.tar.gz and run its install.sh (your notes and settings
stay). Uninstall: sh tandem-linux/install.sh --uninstall (your notes stay).

The package holds the app for x86-64 and ARM 64-bit, and their checksums (SHA256SUMS), checked
before installing.
