Tandem for macOS
================

Installs Tandem from this package: no network, no Docker, no Node, no admin rights.
Everything goes in your home folder.

1. Unzip tandem-macos.zip (double-click it).
2. Open Terminal, and run (drag the folder onto the Terminal window to type its path):

     sh ~/Downloads/tandem-macos/install.sh

3. Answer where your notes live (any folder, also a synced one: OneDrive, iCloud…).

Tandem then starts at login and opens http://localhost:3000. To install it as an app, use your
browser's install button (Chrome, Edge, Brave: in the address bar; Safari: File › Add to Dock).

Update: download the latest tandem-macos.zip and run its install.sh (your notes and settings
stay). Uninstall: sh ~/Downloads/tandem-macos/install.sh --uninstall (your notes stay).

The package holds the app for both kinds of Mac (Apple Silicon and Intel) and their checksums
(SHA256SUMS), checked before installing.
