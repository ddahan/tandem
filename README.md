# Tandem

Local notes, written by you **and** your agents.

Tandem is a note-taking app that runs on your computer (macOS or Linux) and keeps everything
in one folder of plain Markdown files — typically inside OneDrive, so your notes are synced and backed
up. You write in a rich editor; agents (Claude Code, Claude Desktop, scripts) write through an
MCP server or a CLI, and every line remembers who wrote it.

![Tandem](docs/screenshot.png)

## Features

- **Rich editor that writes Markdown**: headings, lists, to-dos, tables, code with highlighting,
  Mermaid diagrams, callouts, collapsible sections, emojis, links, resizable images. `/` for
  blocks, `[[` to link a note, `:` for emojis, a raw Markdown mode when you need it.
- **Databases**: tables with typed columns, sorted and filtered, kept in Tandem (a note shows
  one with a block); agents read and fill them too.
- **Autosave** in the background, with conflict detection when an agent edits the same note.
- **Pages in a tree** (pages can have child pages; one with no content of its own shows as a
  folder), with drag and drop, tags, breadcrumbs, and icons (an emoji or an image).
- **Files**: drop or paste a file anywhere in a note; it is copied next to the note
  (`Note.assets/`) and shown as an image or a file chip.
- **Search** (`⌘⇧F`): prefixes, accents ignored, typos corrected, `"phrases"`, `-word`,
  `tag:x`, `in:Folder`, attachment names.
- **History** of every note (a version per editing session and per author), with diffs and
  restore; **authorship** of each line (you, an agent, or an external edit).
- **TODOs**: write `TODO:` in a note; it is highlighted, and the TODOs page lists them all,
  one click away from each.
- **Trash** with restore and permanent delete.
- **For agents**: an MCP server and a CLI with the same operations.
- Light, dark or system theme; background tone (white, paper, sepia, cool); accent color, gray tone, corner radius, editor font, width and text size.
- Installable as an app with its own window and Dock icon.

## Install

In Terminal (macOS or Linux), with no admin rights:

```bash
curl -fL https://github.com/ddahan/tandem/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && sh /tmp/tandem-main/app/install.sh
```

It downloads the repository from GitHub (its `app/` is the latest
[release](https://github.com/ddahan/tandem/releases)'s: it is only rebuilt for a release) into
`/tmp`, and runs its installer, which finds Node (or offers to download it), copies the app into your home folder, writes the `tandem` command (the
app run by that Node), asks where your notes live (default `~/Tandem`; a OneDrive or iCloud
folder works), starts Tandem at login (all in your home folder), opens
<http://localhost:3864> and removes the download. It only reaches github.com (and
codeload.github.com, where GitHub serves archives), so it also works behind company proxies that
block raw.githubusercontent.com.

> **Node.js 22.16 or later (not 23)** runs Tandem, a JavaScript app (in `app/tandem/`, about
> 11 MB). If the computer has one (`node -v`; Node 22 and 24, the long-term support versions,
> or newer), the installer uses it and needs no network. If not, it offers to download one for
> Tandem only (about 50 MB from nodejs.org, checked against the checksums in `app/node.env`,
> never added to your `PATH`). Behind a company proxy that blocks it, install Node yourself
> first: [nodejs.org](https://nodejs.org)'s `.tar.gz` (unpack it anywhere), nvm or Volta need
> no admin rights; its `.pkg` does.

### Without the command (company network, offline)

Where a proxy blocks GitHub from the terminal, or with no network, download the app by hand: it is in this
repository (`app/`), with no Docker and no admin rights, and this works where GitHub's other
downloads are blocked.

1. Download the latest release, on any computer: on its
   [page](https://github.com/ddahan/tandem/releases/latest), **Source code (zip)** (or `git
   clone`). Copy it to the computer where Tandem goes if it's another one.
2. Unzip it (double-click).
3. Run the installer, in Terminal (the folder is named after the version):

   ```bash
   sh ~/Downloads/tandem-0.5.0/app/install.sh
   ```

It does the same as the command above.

### Afterwards

- **Notes folder**: change it in **Settings › Notes folder** (the app restarts on the new one
  in a few seconds; nothing is moved).
- **Update**: the same command again, or the installer of a newer download (your notes folder
  is remembered), using the same Node as before (asking nothing). To switch to another Node:
  `TANDEM_NODE=/path/to/node` in front of `sh`.
- **Uninstall** (your notes stay; a Node downloaded for Tandem goes): the same command with
  `--uninstall` at the end, or `sh <its folder>/app/install.sh --uninstall`.
- **A given release**: in the command, `refs/tags/v0.5.1` instead of `refs/heads/main`, and
  `tandem-0.5.1` instead of `tandem-main`.
- Options, as environment variables in front of `sh` (`… && TANDEM_PORT=4000 sh /tmp/…`):
  `TANDEM_NODE` (the Node to use), `TANDEM_INSTALL_NODE`
  (`1`: download Node without asking when none fits; `0`: never), `TANDEM_NODE_MIRROR` (a copy
  of `https://nodejs.org/dist`, e.g. your company's), `TANDEM_DATA_DIR`, `TANDEM_PORT`, `TANDEM_BIN_DIR`,
  `TANDEM_HOME` and `TANDEM_SERVICE_LABEL` (to run a second instance). Logs:
  `~/Library/Logs/Tandem.log` (macOS), `journalctl --user -u tandem` (Linux).
- **Port**: 3864, or the next free one if another app uses it (the installer says which). It
  then stays: an update whose port another app took stops and says so, and Tandem started at
  login waits for its port to be free. An install from before 3864 (on 3000 to 3020) moves to
  it on update (the installer gives the new address), unless `TANDEM_PORT` is set.
- With OneDrive, right-click the folder in Finder → **Always Keep on This Device**.

### Installing with an AI agent

Steps for an agent (Claude Code…) asked to install Tandem on this computer:

1. **Never** use `sudo` or ask for admin rights, and **don't build from source**: building needs
   ~1,000 npm packages from the network. The app comes built, in `app/`.
2. Check Node: `node -v` must be 22.16 or later, and not 23. If it isn't, ask the user whether
   the installer may download one for Tandem (about 50 MB from nodejs.org): if so, add
   `TANDEM_INSTALL_NODE=1` in front of `sh` in step 3 or 4 (the installer can't ask you itself); if the download
   fails (a proxy), tell the user to install Node first (see above). With several Nodes (nvm…),
   pass a suitable one as `TANDEM_NODE=/path/to/node`.
3. Run the command with the notes folder chosen by the user (set it: the installer would
   otherwise ask on the terminal):
   `curl -fL https://github.com/ddahan/tandem/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && TANDEM_DATA_DIR="$HOME/Tandem" sh /tmp/tandem-main/app/install.sh`
4. If it can't download (a proxy blocks GitHub), use the repository instead: find it on the
   computer (a clone, or an unzipped `tandem-…` folder: `ls ~/Downloads ~/Desktop`), or ask the
   user to download the latest release (its source code ZIP) on any computer and copy it here;
   then run `TANDEM_DATA_DIR="$HOME/Tandem" sh <its folder>/app/install.sh`.
5. Check it runs: `curl -fs http://localhost:<port>/health` answers `{"ok":true}` (the port is
   in the installer's last lines: 3864, or the next free one when another app uses it).
6. Tell the user to open Tandem's address and install it as an app (below), and offer to
   connect Claude to it (see [Agents](#agents)).

### With Docker instead

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) and a clone of this
repository:

```bash
cp .env.example .env     # then set TANDEM_DATA_DIR to your notes folder
./td start               # builds and starts the app
```

Open <http://localhost:3864>. The app restarts with Docker; `./td stop` stops it and
`./td logs` shows its output. After pulling changes, `./td start` rebuilds. Docker can't read
OneDrive's online-only files: keep the folder on the device.

### As a Mac app

- **Safari**: open <http://localhost:3864>, then **File → Add to Dock**.
- **Chrome**: open it, then **⋮ → Cast, save and share → Install page as app**.

It then opens in its own window, with the Tandem icon in the Dock.

## Agents

### MCP (Claude Code, Claude Desktop, any MCP client)

```bash
claude mcp add --transport http tandem http://localhost:3864/mcp --header "X-Tandem-Author: claude"
```

The header names the agent in the history and authorship views. Tools: `search_notes`,
`list_notes`, `read_note`, `create_note`, `append_to_note`, `replace_in_note`,
`write_note`, `rename_note`, `move_note`, `delete_note`, `set_tags`, `set_icon`, `list_tags`,
`note_history`, `read_version`, `attach_file`.

### CLI

Installed with the installer, Tandem is also the `tandem` command. With Docker, `bin/tandem`
runs the CLI inside the running container; put it on your `PATH` once:

```bash
ln -s "$PWD/bin/tandem" /usr/local/bin/tandem
```

```bash
tandem search "roadmap tag:work"
TANDEM_AUTHOR=claude tandem append "Projects/Roadmap" "- [ ] Write the docs"
tandem attach "Projects/Roadmap" ~/Desktop/diagram.png --insert
tandem --help
```

See [docs/agents.md](docs/agents.md) for everything agents need to know (and paste into their
instructions).

## Your data

```
<your notes folder>/
  Projects.md                 a page
  Projects/                   its child pages
    Roadmap.md
    Roadmap.assets/           Roadmap's attachments
  Ideas/                      a page without content, shown as a folder
  .tandem/
    tandem.db              backup of the app's database (refreshed every minute)
    history/<note id>/        past versions of notes
    icons/                    image icons of pages and folders
    trash/                    deleted notes
```

- Notes are plain Markdown, without front matter: readable and editable by any tool. Edits
  made outside the app (an agent, a text editor, Finder) are picked up live.
- Ids, tags, order, history and authorship are in a SQLite database outside the notes folder
  (`~/Library/Application Support/Tandem/` on macOS, `~/.local/share/tandem/` on Linux, a
  volume with Docker), backed up into `.tandem/tandem.db`. If it is lost, the backup is
  restored automatically on the next start; this is also how you move from Docker to the
  installer (or back): point the new one at the same notes folder.
- One computer at a time: don't run two Tandem instances on the same folder.

## Development

Everything goes through `./td` (run it alone for the list):

| Task                                                | Command                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Dev servers with reload (localhost:3010)            | `./td dev`                                                  |
| Demo notes (while `./td dev` runs)                  | `./td pnpm --filter @tandem/server seed http://server:3011` |
| All checks (format, lint, build, types, unit tests) | `./td check`                                                |
| End-to-end tests (Playwright)                       | `./td e2e`                                                  |
| Unit tests of one package                           | `./td test server`                                          |
| The app people install (`app/tandem/`)              | `./td release`                                              |

### Releasing

Set the version in `packages/standalone/package.json`, then run `./td release`: it builds the
app (`tandem.mjs`, the web app, the migrations) into `app/tandem/` and checks it on Node 22.16 and
on the Node the installer downloads (`app/node.env`, in Docker). To move that one to a newer Node:
`./td node-pin <version>`, then `./td release`. Commit and push `app/tandem/`: that's the release (people install from the
repository). Then tag it (`vX.Y.Z`) and publish a GitHub release for its notes, with no files
attached: its source ZIP holds `app/`. Each release adds about 3 MB to the repository's history.

Read [AGENTS.md](AGENTS.md) before changing the code, and [docs/](docs) for the specification
and the architecture.

## License

[MIT](LICENSE).
