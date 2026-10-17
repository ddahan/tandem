# Myfluence — product specification

The reference for what Myfluence does and why. It was agreed with the owner before the first
build (October 2026). When the code and this document disagree, fix one of them in the same
change: this file describes the intended behavior, `docs/architecture.md` describes how it is
built.

## Purpose

A local, single-user note-taking app whose notes are written both by the owner (in a rich
editor) and by coding agents (through a CLI, an MCP server, or by editing the Markdown files
directly). It runs on one Mac, in Docker, and stores everything in one configurable folder,
typically inside OneDrive so that it is backed up and synced.

## Storage

- **Notes are plain Markdown files** (GFM), without front matter: nothing in a file that a
  human or an agent did not write. The tree in the app is the folder tree on disk.
- **A page can have child pages** (Confluence style): `Projects.md` and its children in
  `Projects/`. A plain folder (without a `.md` of the same name) is a folder in the tree.
- **Attachments** of `Note.md` live in `Note.assets/`, next to it, and are referenced with
  relative paths (`![](Note.assets/diagram.png)`, `[report.pdf](Note.assets/report.pdf)`).
- **Structured data lives in SQLite**: stable note ids, tags, creation and update dates, tree
  order, history metadata, line authorship and settings. The live database is on a local
  Docker volume (never inside OneDrive: SQLite and file sync don't mix). About a minute after
  any change, and on shutdown, a consistent copy is written to `<data>/.myfluence/myfluence.db`;
  it is restored automatically when the local database is missing.
- **External edits** (an agent editing a file, Finder moving one) are picked up by a file
  watcher. A file that disappears and reappears elsewhere with the same content keeps its
  metadata (a move). Writing through the CLI or MCP server is preferred: it keeps authorship.
- **Single computer**: one instance of the app uses a data folder at a time.
- OneDrive's "Always keep on this device" must be enabled on the data folder (Docker can't
  read online-only placeholders).

## Editing

- WYSIWYG editor (Nuxt UI Editor, built on TipTap) that reads and writes Markdown; a raw
  Markdown mode is available but secondary.
- **Autosave** in the background, about half a second after typing stops; a discreet status
  shows "Saving… / Saved". Nothing to click.
- Formatting: headings, bold/italic/strike/inline code, links, lists, task lists, quotes,
  code blocks with syntax highlighting and a copy button, Mermaid diagrams (read mode shows
  the diagram only; edit mode, toggled per diagram, adds its code above it), callouts
  (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`…), collapsible sections (`<details>`), horizontal
  rules, emojis (`:shortcode:` and a picker), tables (GFM: no merged cells, inline content
  only), a `/` slash menu and a floating toolbar.
- **Images** display inline and can be resized (saved as `<img src="…" width="…">`).
- **Files**: drop or paste a file anywhere in a note: it is copied into the note's `.assets/`
  folder and inserted at the drop point, as an image or as a file chip (a link, with the
  icon of its file type, or a generic one). A chip is a button: clicking it downloads the
  file. Files over
  10 MB ask for confirmation first. No maximum size.
- **Links between notes**: `[[Note title]]` (or `[[Folder/Note title]]` when titles are
  ambiguous), with autocomplete when typing `[[`, a backlinks panel, and automatic link
  updates when a note is renamed or moved.
- **Conflicts**: if a note changes on disk while it is open, it reloads live when there are no
  unsaved edits; otherwise a banner offers "Keep mine", "Take theirs" or "Compare".

## History and authorship

- A snapshot of a note is kept at the end of each editing session: after 30 seconds without
  saves, or as soon as another author writes. Snapshots are Markdown files in
  `<data>/.myfluence/history/<note id>/`; their metadata is in SQLite.
- The history panel lists versions (date, author), shows a diff against the current version
  and restores one (restoring is itself a new version). Old versions are thinned out: all
  are kept for 7 days, then one per day for 3 months, then one per week.
- **Line authorship**: every save records its author: the owner (from the UI), an agent
  (named by the CLI `--author` or `MYFLUENCE_AUTHOR`, or by the MCP connection), or
  `external` (a direct file edit). Lines keep the author who last changed them, like
  `git blame`. An "Authorship" view shows each block with its author's color, author and
  date. A paragraph edited by two authors belongs to the last one.

## Organization

- Sidebar tree of pages and folders, with drag and drop to reorder and move, and the usual
  actions (new page, new child page, new folder, rename, delete).
- Breadcrumb above each note.
- Tags on notes (stored in SQLite).
- Icons: any page or folder can be given an emoji or an image (from the computer) after its
  creation: from the note page (left of the title; "Add icon" next to the date) or the tree's menu. Shown in the tree, the
  breadcrumb, the note page, search results and Home. Stored in SQLite (images in
  `<data>/.myfluence/icons/`), never in the Markdown.
- Nothing else (no favorites, recents, daily notes or templates for now).

## Search

- One search: the `Cmd+Shift+F` palette (also the sidebar's search button, the Home page's Search
  button, and tags, which open it filtered on the tag), over note titles, note text and
  attachment file names. With an empty query it lists recent notes and the search syntax.
- Prefix matching while typing, accent-insensitive (`ete` finds `été`), typo-tolerant (a
  word without matches is replaced by the closest known word, with "Showing results for…"),
  quoted phrases, and filters: `tag:<tag>`, `in:<folder>`, `-word` to exclude.
- Ranking: title matches first, then body (BM25), with a small boost for recent notes;
  snippets highlight the matched words.
- No search inside attached files.

## Trash

- Deleting a note moves it to the trash with its child pages, attachments and history.
  Restoring puts everything back.
- "Delete forever" per item and "Empty trash", both with a confirmation.

## Agents

- **CLI** `myfluence` (run in the container; `bin/myfluence` wraps `docker compose exec`):
  search, tree, read, create, write, append, replace text, move, delete, tags, history,
  restore, attach files.
- **MCP server** over HTTP at `http://localhost:3000/mcp` with the same operations, so any
  MCP client (Claude Code, Claude Desktop…) can use Myfluence.
- No public REST API: the HTTP API is internal to the web app, the CLI and the MCP server.

## Interface

- Nuxt UI Dashboard layout: sidebar (search, tree; Trash, Settings and Shortcuts at the
  bottom; the logo leads Home), note header (breadcrumb, tags, save status, actions), editor,
  collapsible right panel (outline, backlinks, history, attachments). Full-width toggle.
  Keyboard shortcuts throughout.
- VS Code editing shortcuts: move blocks and list items (⌥↑/⌥↓), duplicate them (⇧⌥↑/⇧⌥↓),
  delete them (⌘⇧K), insert a line below or above (⌘↵ / ⌘⇧↵), and select occurrences of a
  word (⌘D, ⌘⇧L) to type, erase or delete in all of them at once (Esc goes back to one
  selection; pasting into several isn't supported).
- Find in the note (⌘F, ⌘⌥F with replace), as in VS Code: highlighted matches, count, next /
  previous, match case, replace and replace all. ⌘⇧F opens the search across all notes, with
  the selected text.
- Pages tree from the keyboard: arrows to move and expand, ↵ to open, F2 to rename, ⌥↑/⌥↓ to
  reorder, ⌘⌫ to move to the trash. Moving to the trash from the tree has no confirmation: the
  message that follows offers Undo.
- A landing page at `/landing` presents Myfluence (full width, without the sidebar): a note
  written live by the owner and an agent, the features, the agents' CLI and MCP, the files, the
  shortcuts. Animated, in the accent color and both modes; with reduced motion, every demo
  shows its final state.
- A Keyboard shortcuts page (sidebar, ⌘⇧F palette, ⌘/) lists every shortcut and typing rule;
  the tree's menu shows the shortcuts of its actions.
- Light, dark or system color mode. Settings page: color mode, background tone (white, paper,
  sepia or cool, each with a light and a dark variant), primary and neutral colors,
  corner radius, editor font, width and text size (notes only: the interface keeps its size), the
  owner's display name, and the workspace name (next to the logo and in the browser tab;
  Myfluence by default).
- The logo (sidebar and browser tab) is drawn in the accent color. The installed app's Dock
  icon is the default (indigo) logo: macOS keeps the image it got at install.
- Installable as an app (web app manifest): its own window and Dock icon. In a browser tab
  that can install it, the sidebar offers to (the logo, "Install Myfluence"): Chrome and Edge
  show their install dialog; Safari, which has none, gets the steps (File › Add to Dock…, or
  Share › Add to Home Screen on iOS). Closing the offer hides it for good; Settings › App still
  offers to install, or says it's installed. Hidden in the installed app and in browsers that
  can't install.
- English interface; French formats for dates, times and numbers (`17/10/2026 14:32`).
- Must feel instant: local-first interactions, optimistic updates, no full-page loads.

## Out of scope (for now)

Templates, export (PDF/HTML), daily notes, favorites, search inside attachments, multiple
computers on one data folder, authentication (bound to 127.0.0.1 only), tables beyond GFM.
