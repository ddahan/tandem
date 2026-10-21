// The one-line install (README › Install), shown by the landing page and Docs › Install: GitHub's
// archive of main (whose app/ is the latest release's: it is only rebuilt for a release),
// unpacked in /tmp, then its installer. Only github.com and its archive host: not
// raw.githubusercontent.com, which company proxies often block.
export const INSTALL_COMMAND =
  'curl -fL https://github.com/ddahan/tandem/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && sh /tmp/tandem-main/app/install.sh'

/** The command in pieces that read alone (`… | tar …`, `&& sh …`), to wrap between them. */
export const INSTALL_COMMAND_PARTS = INSTALL_COMMAND.split(/ (?=\| |&& )/)
