# Tandem, ready to install

This folder is the app itself, so that downloading the repository is enough, even where
GitHub's releases are blocked:

- `install.sh`: the installer.
- `tandem-darwin-arm64.gz`, `tandem-darwin-x64.gz`: macOS (Apple Silicon, Intel).
- `tandem-linux-arm64.gz`, `tandem-linux-x64.gz`: Linux (ARM 64-bit, x86-64).
- `SHA256SUMS`: their checksums, checked before installing.

Install: download the repository (on GitHub: **Code › Download ZIP**), unzip it, then run
`sh ~/Downloads/tandem-main/app/install.sh`. No network, no admin rights. See the
[README](../README.md#install).

`./td release` rebuilds these files (see [Releasing](../README.md#releasing)).
