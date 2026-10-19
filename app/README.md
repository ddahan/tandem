# Tandem, ready to install

This folder is the app itself, so that downloading the repository is enough, even where
GitHub's other downloads are blocked:

- `tandem/`: the app (JavaScript and the web app, about 11 MB), built by `./td release`.
- `install.sh`: the installer.
- `node.env`: the Node it downloads when the computer has no suitable one (version and
  checksums; `./td node-pin <version>` changes it).

The app runs on Node.js 22.16 or later (not 23): the computer's, or one the installer offers to
download for Tandem only.

Install: download the repository (on GitHub: **Code › Download ZIP**), unzip it, then run
`sh ~/Downloads/tandem-main/app/install.sh`. No admin rights; no network either when Node is
there. See the [README](../README.md#install).
