# Tandem — product specification

The reference for what Tandem does and why. It was agreed with the owner before the first
build (October 2026). When the code and this document disagree, fix one of them in the same
change: this file describes the intended behavior, `docs/architecture.md` describes how it is
built.

## Purpose

A local, single-user note-taking app whose notes are written both by the owner (in a rich
editor) and by coding agents (through a CLI, an MCP server, or by editing the Markdown files
directly). It runs on one computer and stores everything in one configurable folder, typically
inside OneDrive so that it is backed up and synced.

## Installation

- **Standalone** (the default): a JavaScript app (about 11 MB) run by Node **22.16 or later,
  not 23** (none is bundled in the repository). The installer uses the computer's when it fits
  (`TANDEM_NODE`, then the one the installed version runs on, then the `PATH`'s), asking
  nothing; otherwise it asks whether to download one for Tandem only (nodejs.org, the version
  and checksums of `app/node.env`, into the app folder, never on the `PATH`): a download that
  fails or doesn't match the checksum is refused, and the installer says how to install Node by
  hand (behind a company proxy). Without a terminal (an agent), it downloads only with
  `TANDEM_INSTALL_NODE=1`; a Node it downloaded and that no longer fits is replaced without
  asking. The app is in the repository (`app/tandem/`), so downloading it (a ZIP from GitHub,
  on any computer) is enough; GitHub releases only carry notes. `app/install.sh` installs it
  with no admin rights (macOS and Linux), and with no network when Node is there: it finds
  Node, asks for the notes folder, starts it at login (a
  LaunchAgent on macOS, a systemd user service on Linux; restarted if it stops) and opens the
  app. Running it from a newer download updates it (the notes folder is remembered), and open
  windows switch to the new version by themselves (after saving what's being typed); `--uninstall`
  removes it (with a Node it downloaded) and never touches the notes. Port 3000 by default, or the next free one when
  another app uses it (said); it then stays (the installed app's address): an update or a
  `TANDEM_PORT` whose port another app uses stops before changing anything, naming the app.
  Started while another app holds its port, Tandem waits for it (logged once) instead of
  failing.
- **Docker**: `./td start` from a clone of the repository (the developer's setup).
- Both use the same notes folder layout; switching between them only takes pointing the new
  one at the same folder (its database is restored from the folder's backup).
- **Settings › Notes folder** shows the folder in use. In the standalone app (run as the login
  item), "Change…" opens a folder picker drawn by the app (the server lists folders: a browser
  can't): places (Home, Documents, iCloud Drive, OneDrive…), the path, subfolders, "New
  folder", a path field, and "Show hidden folders" (⇧⌘., as in Finder: folders whose name
  starts with a dot). iCloud Drive lists, as Finder does, the apps' iCloud folders after the
  user's own (NotePlan, Pages…: named after the app, marked "app"), which live elsewhere on
  disk (`Mobile Documents/<app>/Documents`); empty and internal ones are left out. It says what the selected folder holds (Tandem notes, whose history
  and tags come along; Markdown files, which become notes; nothing) or why it can't be used
  (the home folder or the disk itself, Tandem's own folder, missing, not writable). Switching
  saves the choice and restarts the app's server on it (a few seconds), then the app reloads;
  nothing is moved or copied. Each folder keeps its own database. With Docker, or when started
  by hand, the folder is shown read-only, with how to change it.

## Storage

- **Notes are plain Markdown files** (GFM), without front matter: nothing in a file that a
  human or an agent did not write. The tree in the app is the folder tree on disk.
- **A page can have child pages** (Confluence style): `Projects.md` and its children in
  `Projects/`. A plain folder (without a `.md` of the same name) is a folder in the tree.
- **Attachments** of `Note.md` live in `Note.assets/`, next to it, and are referenced with
  relative paths (`![](Note.assets/diagram.png)`, `[report.pdf](Note.assets/report.pdf)`).
- **Structured data lives in SQLite**: stable note ids, tags, creation and update dates, tree
  order, history metadata, line authorship, settings, and databases (their columns, view and
  rows: a note only has a block naming one, see Databases). The live database is in the app's own
  folder (`~/Library/Application Support/Tandem/` on macOS) or on a Docker volume, never inside
  OneDrive (SQLite and file sync don't mix). About a minute after
  any change, and on shutdown, a consistent copy is written to `<data>/.tandem/tandem.db`;
  it is restored automatically when the local database is missing.
- **External edits** (an agent editing a file, Finder moving one) are picked up by a file
  watcher. A file that disappears and reappears elsewhere with the same content keeps its
  metadata (a move). Writing through the CLI or MCP server is preferred: it keeps authorship.
- **Single computer**: one instance of the app uses a data folder at a time.
- With Docker, OneDrive's "Always keep on this device" must be enabled on the data folder
  (Docker can't read online-only placeholders); the standalone app reads them like any app.

## Editing

- WYSIWYG editor (Nuxt UI Editor, built on TipTap) that reads and writes Markdown; a raw
  Markdown mode is available but secondary: numbered lines (wrapped lines keep one number);
  hovering it shows a small copy button (top right), as on code blocks.
- **Markdown the editor can't show** (HTML comments; raw HTML other than `<br>`, `<img>`,
  `<details>`/`<summary>`: its tags go, its text stays) would be lost at the first edit in the
  editor. So a note containing some opens read-only, with a red message naming the lines and
  two choices: "Edit Markdown" (the Markdown view) or "Edit anyway" (the loss accepted for
  this content). The message's line numbers are links to the lines in the Markdown view, where
  their numbers are red. In the Markdown view, the same message and a red border appear as it is
  typed, and the view won't switch to the editor ("Open the editor anyway" does). Rewrites
  that keep everything (`*` bullets as `-`, `__` as `**`, padded tables, renumbered lists) don't
  count.
- **Autosave** in the background, about half a second after typing stops; a discreet status
  shows "Saving… / Saved". Nothing to click.
- Formatting: headings, bold/italic/strike/inline code, links, lists, task lists, quotes,
  code blocks with syntax highlighting and a copy button, Mermaid diagrams (read mode shows
  the diagram only; edit mode, toggled per diagram, adds its code above it), callouts
  (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`…), collapsible sections (`<details>`), horizontal
  rules, emojis (`:shortcode:` and a picker), tables (GFM: no merged cells, inline content
  only), a `/` slash menu and a floating toolbar.
- **Lists**: each level of a list has one kind, and any level can have any kind (a to-do list
  under a bullet item, bullets under a to-do…). A list marker (`- `, `1. `, `[ ] ` or `[] `)
  typed at the start of an item, the slash menu, the toolbar or ⌘⇧7/8/9 change the kind of the
  cursor's level, keeping its text (the same kind again turns the item back into a paragraph);
  the level's own marker typed there is absorbed, and `[x] ` / `[ ] ` set a to-do's box. Keys
  move an item one level at a time, the same whatever the kinds: Tab goes under the item above
  (into its sub-items, taking their kind; a first item stays); Shift+Tab, Enter in an empty
  item and Backspace at the start of an item go one level out, taking that level's kind (the
  items after it become its sub-items; from the top level, a paragraph); Backspace at the start
  of a paragraph after a list joins the list's last line; Delete at the end of a line brings its
  first sub-item one level up, then joins it. A new to-do is unchecked; a done one is struck
  through, not its sub-items. Empty items aren't saved (Markdown can't keep them), and what's
  saved reads back the same, in any nesting.
- **Moving blocks**: a handle (⋮⋮) left of the block under the pointer drags it anywhere in the
  note: paragraphs, headings, tables, code, callouts, and list items one by one (with their
  nested items; into another list, they take its kind). For bullet and numbered items the
  handle sits left of the marker, never over it. Moving keeps each line's author.
- **Images** display inline and can be resized (saved as `<img src="…" width="…">`).
- **Files**: drop or paste a file anywhere in a note: it is copied into the note's `.assets/`
  folder and inserted at the drop point, as an image or as a file chip (a link, with the
  icon of its file type, or a generic one). A chip is a button: clicking it opens the file
  in a new tab, as in the Files panel (the browser shows PDFs, images, videos and text, and
  downloads other files). Files over
  10 MB ask for confirmation first. No maximum size.
- **Databases**: next to tables (GFM, in the note), `/database` inserts a database: a table
  whose rows and typed columns (text, number, date, checkbox, choice) are kept in Tandem, not
  in the Markdown. The note only has a block naming it (` ```database ` with `id: …`); the
  data is safe in the database and its backup copy. Cells are edited in place (dates typed day,
  month, year, or picked in a calendar whose weeks start on Monday, shown `17/10/2026`; numbers
  French; a value of the wrong type is refused). Each
  column's menu renames it, changes its type (values converted when they can be; a column
  becoming a choice list takes its values as choices), edits choices, sorts, filters, moves
  and deletes it. A choice list can require a value ("Allow empty" unchecked in its choices):
  new rows then start with its first choice, empty cells take it at once, and a cell can't
  be emptied. The sort and the filters (every condition must match) are saved with the
  database, so everyone, agents included, sees the same view. A page can have any number of
  databases; they go to the trash with their page and come back with it. Removing a block
  keeps its database (undo brings it back); pasting a block elsewhere shows the same
  database, not a copy. A block whose database is gone says so.
- **Databases panel** (side panel): the databases the note shows, in order, with their row
  counts; a click scrolls to one.
- **Files panel** (side panel): the note's attachments, with their size; files dropped or
  picked there are attached and added at the end of the note. Clicking an image shows it in a
  modal, scaled to fit, with its name and size; Esc, a click outside or its close button
  close it, and its new-tab button opens the file. Other files, and ⌘/Ctrl-clicks, open in a
  new tab.
- **Links between notes**: `[[Note title]]` (or `[[Folder/Note title]]` when titles are
  ambiguous), with autocomplete when typing `[[`, a backlinks panel, and automatic link
  updates when a note is renamed or moved. A link to a note that doesn't exist yet looks
  different (muted, a "new file" icon, a copy cursor), and clicking it offers to create the
  note; it turns into a normal link as soon as the note exists.
- **Conflicts**: if a note changes on disk while it is open, it reloads live when there are no
  unsaved edits; otherwise a banner offers "Keep mine", "Take theirs" or "Compare".

## History and authorship

- A snapshot of a note is kept at the end of each editing session: after 30 seconds without
  saves, or as soon as another author writes. Snapshots are Markdown files in
  `<data>/.tandem/history/<note id>/`; their metadata is in SQLite.
- The history panel lists versions (date, author), shows a diff against the current version
  and restores one (restoring is itself a new version). Old versions are thinned out: all
  are kept for 7 days, then one per day for 3 months, then one per week.
- **Line authorship**: every save records its author: the owner (from the UI), an agent
  (named by the CLI `--author` or `TANDEM_AUTHOR`, or by the MCP connection), or
  `external` (a direct file edit). Lines keep the author who last changed them, like
  `git blame`; moving lines (a dragged block, renumbered list items) isn't changing them.
  An "Authorship" view shows each block with its author's color, author and
  date. A paragraph edited by two authors belongs to the last one.

## Organization

- Sidebar tree of pages and folders, with drag and drop to reorder and move, and the usual
  actions (new page, new child page, new folder, rename, delete) in each row's menu: its ⋯
  button, or a right-click on the row. A new page opens with its title selected, however it was
  created (button, menu, shortcut): typing replaces it.
- Breadcrumb above each note.
- Tags on notes (stored in SQLite).
- Icons: every page has one, the default page icon until it is given an emoji or an image
  (from the computer): from the note page (click the icon left of the title) or the tree's
  menu (folders too); "Use the default icon" goes back. The picker searches emojis or shows
  one group at a time, chosen from tabs (line icons, not emojis), its name above its emojis.
  Shown in the tree, the
  breadcrumb, the note page, search results and Home. Stored in SQLite (images in
  `<data>/.tandem/icons/`), never in the Markdown.
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

- **CLI** `tandem` (run in the container; `bin/tandem` wraps `docker compose exec`):
  search, tree, read, create, write, append, replace text, move, delete, tags, history,
  restore, attach files, and databases (list a note's, read rows as the saved view shows
  them, create one, add, change and delete rows; columns by name).
- **MCP server** over HTTP at `http://localhost:3000/mcp` with the same operations, so any
  MCP client (Claude Code, Claude Desktop…) can use Tandem.
- No public REST API: the HTTP API is internal to the web app, the CLI and the MCP server.

## Interface

- Nuxt UI Dashboard layout: sidebar (search, tree; Trash, Settings and Shortcuts at the
  bottom; the logo leads Home), note header (breadcrumb, tags, save status, actions), editor,
  collapsible right panel (outline, backlinks, history, attachments). Full-width toggle.
  The outline highlights the heading being read; one picked in it stays highlighted until the
  note is scrolled.
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
- A landing page at `/landing` presents Tandem (full width, without the sidebar): a note
  written live by the owner and an agent, the features, the agents' CLI and MCP, the files, the
  shortcuts. Animated, in the accent color and both modes; with reduced motion, every demo
  shows its final state. The sidebar's "About Tandem" button (ⓘ, next to the collapse button)
  shows it fullscreen over the app; its links into the app close it and go there, Escape closes.
- A Keyboard shortcuts page (sidebar, ⌘⇧F palette, ⌘/) lists every shortcut and typing rule;
  the tree's menu shows the shortcuts of its actions.
- Light, dark or system color mode, switched from one button at the bottom of the sidebar (it
  shows the current mode; its menu offers the three). Settings page: color mode, background tone
  (white, paper, sepia or cool, each with a light and a dark variant), primary and neutral colors,
  corner radius, editor font, width and text size (notes only: the interface keeps its size), the
  code blocks' theme (Tandem, GitHub, One, Dracula, Nord, Solarized or Tomorrow: each a light
  and a dark variant, used in its mode, as the background tones; Tomorrow's dark one is Tomorrow
  Night Eighties, both as VS Code's "Tomorrow and Tomorrow Night Operator Mono" theme), the
  owner's display name, and the workspace name (next to the logo and in the browser tab; Tandem by
  default). Settings start with the app's version (read-only).
- The logo (sidebar and browser tab) is drawn in the accent color. The installed app's Dock
  icon is the default (indigo) logo: macOS keeps the image it got at install.
- Installable as an app (web app manifest): its own window and Dock icon. Its title bar takes
  the page's background color (tone, light or dark: `theme-color`), from the first frame. In a browser tab
  that can install it, the sidebar offers to (the logo, "Install Tandem"): Chrome and Edge
  show their install dialog; Safari, which has none, gets the steps (File › Add to Dock…, or
  Share › Add to Home Screen on iOS). Closing the offer hides it for good; Settings › App still
  offers to install, or says it's installed. Hidden in the installed app and in browsers that
  can't install.
- English interface; French formats for dates, times and numbers (`17/10/2026 14:32`).
- Must feel instant: local-first interactions, optimistic updates, no full-page loads.

## Out of scope (for now)

Templates, export (PDF/HTML), daily notes, favorites, search inside attachments, multiple
computers on one data folder, authentication (bound to 127.0.0.1 only). For databases:
relations, formulas, other views (board, calendar), per-database history, converting a table
into a database.
