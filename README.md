# Myfluence

Local notes, written by you **and** your agents.

Myfluence is a note-taking app that runs on your Mac (in Docker) and keeps everything in one
folder of plain Markdown files — typically inside OneDrive, so your notes are synced and backed
up. You write in a rich editor; agents (Claude Code, Claude Desktop, scripts) write through an
MCP server or a CLI, and every line remembers who wrote it.

![Myfluence](docs/screenshot.png)

## Features

- **Rich editor that writes Markdown**: headings, lists, to-dos, tables, code with highlighting,
  Mermaid diagrams, callouts, collapsible sections, emojis, links, resizable images. `/` for
  blocks, `[[` to link a note, `:` for emojis, a raw Markdown mode when you need it.
- **Autosave** in the background, with conflict detection when an agent edits the same note.
- **Pages in a tree** (pages can have child pages), with drag and drop, tags and breadcrumbs.
- **Files**: drop or paste a file anywhere in a note; it is copied next to the note
  (`Note.assets/`) and shown as an image or a file chip.
- **Search** (`⌘K`): prefixes, accents ignored, typos corrected, `"phrases"`, `-word`,
  `tag:x`, `in:Folder`, attachment names.
- **History** of every note (a version per editing session and per author), with diffs and
  restore; **authorship** of each line (you, an agent, or an external edit).
- **Trash** with restore and permanent delete.
- **For agents**: an MCP server and a CLI with the same operations.
- Light, dark or system theme; accent color, gray tone, corner radius, editor font, width and text size.
- Installable as an app with its own window and Dock icon.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (nothing else: there is no
  Node on the Mac, everything runs in containers).
- A folder for your notes. With OneDrive, right-click it in Finder → **Always Keep on This
  Device**: Docker can't read online-only files.

## Start

```bash
cp .env.example .env     # then set MYFLUENCE_DATA_DIR to your notes folder
./mf start               # builds and starts the app
```

Open <http://localhost:3000>. The app restarts with Docker; `./mf stop` stops it and
`./mf logs` shows its output. After pulling changes, `./mf start` rebuilds.

### As a Mac app

- **Safari**: open <http://localhost:3000>, then **File → Add to Dock**.
- **Chrome**: open it, then **⋮ → Cast, save and share → Install page as app**.

It then opens in its own window, with the Myfluence icon in the Dock.

## Agents

### MCP (Claude Code, Claude Desktop, any MCP client)

```bash
claude mcp add --transport http myfluence http://localhost:3000/mcp --header "X-Myfluence-Author: claude"
```

The header names the agent in the history and authorship views. Tools: `search_notes`,
`list_notes`, `read_note`, `create_note`, `create_folder`, `append_to_note`, `replace_in_note`,
`write_note`, `rename_note`, `move_note`, `delete_note`, `set_tags`, `list_tags`,
`note_history`, `read_version`, `attach_file`.

### CLI

`bin/myfluence` runs the CLI inside the running container. Put it on your `PATH` once:

```bash
ln -s "$PWD/bin/myfluence" /usr/local/bin/myfluence
```

```bash
myfluence search "roadmap tag:work"
MYFLUENCE_AUTHOR=claude myfluence append "Projects/Roadmap" "- [ ] Write the docs"
myfluence attach "Projects/Roadmap" ~/Desktop/diagram.png --insert
myfluence --help
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
  Ideas/                      a folder
  .myfluence/
    myfluence.db              backup of the app's database (refreshed every minute)
    history/<note id>/        past versions of notes
    trash/                    deleted notes
```

- Notes are plain Markdown, without front matter: readable and editable by any tool. Edits
  made outside the app (an agent, a text editor, Finder) are picked up live.
- Ids, tags, order, history and authorship are in a SQLite database on a Docker volume, backed
  up into `.myfluence/myfluence.db`. If the volume is lost (e.g. `docker compose down -v`), the
  backup is restored automatically on the next start.
- One computer at a time: don't run two Myfluence instances on the same folder.

## Development

Everything goes through `./mf` (run it alone for the list):

| Task                                                | Command                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- |
| Dev servers with reload (localhost:3010)            | `./mf dev`                                                     |
| Demo notes (while `./mf dev` runs)                  | `./mf pnpm --filter @myfluence/server seed http://server:3011` |
| All checks (format, lint, build, types, unit tests) | `./mf check`                                                   |
| End-to-end tests (Playwright)                       | `./mf e2e`                                                     |
| Unit tests of one package                           | `./mf test server`                                             |

Read [AGENTS.md](AGENTS.md) before changing the code, and [docs/](docs) for the specification
and the architecture.
