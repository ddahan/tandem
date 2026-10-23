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
  on any computer) is enough; GitHub releases only carry notes (their source archive holds
  the app). **One command** installs it:
  `curl -fL https://github.com/ddahan/tandem/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && sh /tmp/tandem-main/app/install.sh`
  downloads GitHub's archive of `main` (whose `app/tandem/` is the latest release's: it is only
  rebuilt for a release), unpacks it in `/tmp` and runs its installer, which then removes it,
  and shows that command for updating and uninstalling (`--uninstall` at its end). It only
  reaches github.com and codeload.github.com, never raw.githubusercontent.com, which company
  proxies often block. `app/get.sh`, the command published with 0.5.1
  (`curl … raw.githubusercontent.com/…/app/get.sh | sh`), does the same. `app/install.sh` installs it
  with no admin rights (macOS and Linux), and with no network when Node is there: it finds
  Node, asks for the notes folder, starts it at login (a
  LaunchAgent on macOS, a systemd user service on Linux; restarted if it stops) and opens the
  app. Running it from a newer download updates it (the notes folder is remembered), and open
  windows switch to the new version by themselves (after saving what's being typed); on macOS an
  update keeps the login item as it is and only restarts the app (registering it again made
  macOS show a "Login Items" notification); `--uninstall`
  removes it (with a Node it downloaded) and never touches the notes. Port 3864 by default, or the next free one when
  another app uses it (said); it then stays (the installed app's address), except that an
  update moves an install on 3000–3020 (the default before 3864, often taken by dev servers)
  to the default, unless `TANDEM_PORT` is set, and says the new address. An update or a
  `TANDEM_PORT` whose port another app uses stops before changing anything, naming the app.
  Started while another app holds its port, Tandem waits for it (logged once) instead of
  failing.
- **The welcome note**: on its first start on a notes folder that never had notes (none, none in
  the trash), the app writes "Welcome to Tandem" (👋), by "Tandem" (so the authorship view has
  something to show): five things to try as to-dos, a tip, a diagram, the command that
  connects Claude (at this Tandem's address) in a collapsible section, a page inside it
  (Scratchpad ✏️, with a rocket to find with a typo) and a small database (Things to try).
  Only once per folder (a marker in `.tandem/`): deleted, it never comes back, and a folder
  that had notes never gets one. The standalone app and Docker (`TANDEM_WELCOME=true`) ask for
  it; the dev servers and tests don't.
- **Docker**: `./td start` from a clone of the repository (the developer's setup).
- Both use the same notes folder layout; switching between them only takes pointing the new
  one at the same folder (its database is restored from the folder's backup).
- **Settings › General › Notes folder** shows the folder in use. In the standalone app (run as the login
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
- **Everything is a page; a page can have child pages** (Confluence style): `Projects.md` and
  its children in `Projects/`. There are no folders to create: a page without content but with
  child pages shows as a folder (folder icon, unless it has its own), and is one on disk (a
  plain `Projects/`, no `.md`). Writing in it makes it a page (its `.md` is created); erasing all
  of a page that has child pages makes it a folder again (its `.md` deleted, its text kept in
  history). A blank page without child pages stays a page (an empty `.md`). Opening a folder
  shows "Write here to turn this folder into a note." and the list of its pages. Any plain
  folder on disk is such a page.
- **Attachments** of `Note.md` live in `Note.assets/`, next to it, and are referenced with
  relative paths (`![](Note.assets/diagram.png)`, `[report.pdf](Note.assets/report.pdf)`).
- **Structured data lives in SQLite**: stable note ids, tags, creation and update dates, tree
  order, history metadata, line authorship, settings, databases (their columns, view and
  rows: a note only has a block naming one, see Databases) and bookmarks (see Bookmarks). The live database is in the app's own
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
  (into its sub-items, taking their kind; a first item stays), the line alone: its own
  sub-items stay where they are, right after it in its new level (of that level's kind); Shift+Tab, Enter in an empty
  item and Backspace at the start of an item go one level out, taking that level's kind (the
  items after it become its sub-items; from the top level, a paragraph); Backspace at the start
  of a paragraph after a list joins the list's last line; Delete at the end of a line brings its
  first sub-item one level up, then joins it. A new to-do is unchecked; a done one is struck
  through, not its sub-items. Empty items aren't saved (Markdown can't keep them), and what's
  saved reads back the same, in any nesting.
- **Moving blocks**: a handle (⋮⋮) left of the block under the pointer drags it anywhere in the
  note: paragraphs, headings, tables, code, callouts, and list items one by one (with their
  nested items; into another list, they take its kind). For bullet and numbered items the
  handle sits left of the marker, never over it. Callouts and tables move whole: the blocks
  inside them have no handle. The handle jumps from block to block (no sliding: it lagged).
  Moving keeps each line's author.
- **Backspace in an empty first line** (with blocks after it) removes it.
- **Images** display inline and can be resized (saved as `<img src="…" width="…">`); a
  selected one is framed (the image only, its resize dots on the frame).
- **Files**: drop or paste a file anywhere in a note: it is copied into the note's `.assets/`
  folder and inserted at the drop point, as an image or as a file chip (a link, with the
  icon of its file type, or a generic one). A chip is a button: clicking it opens the file
  in a new tab, as in the Files panel (the browser shows PDFs, images, videos and text, and
  downloads other files). Files over
  10 MB ask for confirmation first. No maximum size.
- **Databases**: next to tables (GFM, in the note), `/database` inserts a database: a table
  whose rows and typed columns (text, number, money in euros, date, checkbox,
  choice, multiple choices) are kept in Tandem, not
  in the Markdown. The note only has a block naming it (` ```database ` with `id: …`); the
  data is safe in the database and its backup copy. Cells are edited in place (Enter saves,
  Escape puts the saved value back; text wraps, Shift+Enter starts a new line, and the row
  grows with it; dates typed day, month, year, or picked in a calendar whose weeks start on
  Monday, shown `17/10/2026`; numbers French; amounts in euros (`1 234 €`, kept to the cent;
  as soon as one amount of a column has cents, every amount of it shows two decimals,
  `1 234,00 €`, so that a column's amounts always look alike); choices picked in a menu;
  multiple choices picked in a menu that stays open, with a search, and saved when it closes
  (shown as tags, in the column's order; one without a color as an outlined tag); typing a
  name that isn't a choice offers to create it (added at the end of the column's); a value of the wrong
  type is refused). Columns have a width for their type (the first one wider) until dragged
  from the edge of their heading; the width is saved with the database, and a double-click on
  the edge resets it. A database wider than the page's text makes the page full width while
  the note is open (the ⋯ menu's width toggle then says so); wider still, it scrolls sideways.
  The table is as wide as its columns, an "Add a column" + right after its header. A row's
  buttons show before it on hover (or while one of its cells is being edited): + inserts a row
  right below it, the cursor in its first cell (⌘Enter in a cell too, saving the value first),
  × deletes it at once (⌘Z brings it back). "New row" adds one at the end. ⌥↑ / ⌥↓ in a
  cell move its row up or down among the rows shown, the cursor staying in it; a sorted table
  says it must stop being sorted first. Each column's menu renames it, changes its type (values converted when they can be; a column
  becoming a choice list takes its values as choices, separated by commas for multiple choices;
  between one choice and multiple choices, the choices stay and a cell keeps its first one), edits choices, sorts, filters, moves
  and deletes it (at once: ⌘Z brings it back with its values). Its choices are edited one per
  line (Enter adds the next one; arrows move one, × removes it), each with a color picked
  from nine (none by default): a choice with a color shows as a tag of that color in cells
  and menus, one without as plain text; a renamed choice keeps its color. A choice list can require a value ("Allow empty" unchecked in its choices):
  new rows then start with its first choice, empty cells take it at once, and a cell can't
  be emptied. The sort and the filters (every condition must match) are saved with the
  database, so everyone, agents included, sees the same view; a condition applies once it has
  a value (a new one hides nothing while it is written). A page can have any number of
  databases; they go to the trash with their page and come back with it. Removing a block
  keeps its database (undo brings it back); pasting a block elsewhere shows the same
  database, not a copy. A block whose database is gone says so. A note that starts with a database
  doesn't show it selected (framed) when opened: only a click, the keyboard or the block
  handle select it (bookmark cards alike). A database shown again (its note
  reopened) appears at once as it was last seen, then updates if it changed meanwhile.
- **Databases panel** (side panel): the databases the note shows, in order, with their row
  counts; a click scrolls to one.
- **Files panel** (side panel): the note's attachments, with their size. No drop zone: files
  are dropped on the note; the panel's "click here" opens the file picker, and picked files are
  attached and added at the end of the note (empty, the panel says so like the other tabs). Clicking an image shows it in a
  modal, scaled to fit, with its name and size; Esc, a click outside or its close button
  close it, and its new-tab button (next to the close button, aligned with it) opens the
  file. Other files, and ⌘/Ctrl-clicks, open in a new tab.
- **Removing a file's last link** (its chip or image deleted from the note, by a key, an
  undo…; not a cut, pasted back elsewhere) asks whether to delete the file too: "Delete the
  file" deletes it for good (undo doesn't bring it back), "Keep it" leaves it in the Files
  panel. A file linked again meanwhile stays. Only the note's own attachments.
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

- Sidebar tree of pages, with drag and drop to reorder and move, and the usual actions (new
  page, new page inside, rename, delete) in each row's menu: its ⋯
  button, or a right-click on the row. A click on a row opens its page (a folder too) in the
  preview tab, a double click in a tab of its own (see Tabs); its arrow expands it. Renaming is
  F2 or the menu. The "+" above the tree makes a page. A new page opens with its title selected, however it was
  created (button, menu, shortcut): typing replaces it.
- Above a note's title, the pages it is in (a small breadcrumb, each a link; none for a page at
  the top): the tab says which page this is.
- Tags on notes (stored in SQLite), when tags are on (Settings › Features; off by default).
- Icons: every page has one, the default page icon until it is given an emoji or an image
  (from the computer): from the note page (click the icon left of the title) or the tree's
  menu; "Use the default icon" goes back. The picker searches emojis or shows
  one group at a time, chosen from tabs (line icons, not emojis), its name above its emojis.
  Shown in the tree, the
  breadcrumb, the note page, search results and Home. Stored in SQLite (images in
  `<data>/.tandem/icons/`), never in the Markdown.
- Nothing else (no favorites or templates for now).

## Search

- One search: the `Cmd+Shift+F` palette (also the sidebar's search button, the Home page's Search
  button, and tags on Home, which open it filtered on the tag), over note titles, note text and
  attachment file names, and bookmarks when they're on (a group of their own, under the notes;
  picking one opens its website). With an empty query it lists recent notes and the search
  syntax.
- Prefix matching while typing, accent-insensitive (`ete` finds `été`), typo-tolerant (a
  word without matches is replaced by the closest known word, with "Showing results for…"),
  quoted phrases, and filters: `tag:<tag>`, `in:<folder>`, `-word` to exclude. With tags off,
  `tag:` still filters but isn't among the tips.
- Ranking: title matches first, then body (BM25), with a small boost for recent notes;
  snippets highlight the matched words.
- No search inside attached files.

## Undo and redo

- ⌘Z undoes and ⌘⇧Z redoes (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y elsewhere) anywhere in the app,
  in one history, in the order things were done: a note's text, its databases (values, rows
  added, moved or deleted, columns, title, sort, filters, widths), pages (made, renamed, moved,
  moved to the trash, tags, emoji icons) and bookmarks (made, edited, moved). Typing in a note
  then changing a database: ⌘Z undoes the database change first, then the typing.
- A text field being typed in (a cell, a title) undoes its own typing first; once its text is
  as it was when it got the focus, ⌘Z goes to the history.
- Undoing puts back only what the step changed: what an agent changed since stays. A step
  undone in another note than the one shown says so in a message. A step that can no longer
  be undone (its page deleted for good) says so and is skipped.
- Not in the history, so they still ask first: deleting forever, emptying the trash, deleting
  a bookmark (it removes its cards from notes), settings. A replaced image icon can't come
  back either.
- The history lives in the app's memory: a reload starts a new one. A note's text steps go
  when its tab is closed (its editor's history goes with it).

## Trash

- Deleting a note moves it to the trash with its child pages, attachments and history.
  Restoring puts everything back.
- "Delete forever" per item and "Empty trash", both with a confirmation.
- The trash can be turned off (Settings › Features; on by default). Then deleting a page (tree,
  ⌘⌫, the note's ⋯ menu) asks first, "Delete “…” forever?", and deletes it with its child pages,
  attachments and history; the sidebar and the palette no longer list the trash. Pages already
  in it stay there: its page (still at `/trash`) says the trash is off. Agents' deletions still
  go to the trash.

## Agents

- **CLI** `tandem` (run in the container; `bin/tandem` wraps `docker compose exec`):
  search, tree, read, create, write, append, replace text, move, delete, tags, history,
  restore, attach files, databases (list a note's, read rows as the saved view shows
  them, create one, add, change and delete rows; columns by name), and bookmarks (list, search,
  add, change, move, delete; a card added to a note).
- **MCP server** over HTTP at `http://localhost:3864/mcp` with the same operations, so any
  MCP client (Claude Code, Claude Desktop…) can use Tandem.
- No public REST API: the HTTP API is internal to the web app, the CLI and the MCP server.

## TODOs

- Off by default (Settings › Features). Off, nothing changes in the notes' Markdown: TODO lines
  read as any text, the sidebar doesn't list the TODOs page (still at `/todos`, which says they
  are off), and its count isn't loaded.
- `TODO:` in capitals, not glued to a word before it (`myTODO:`, `todo:` and `TODO` without
  the colon aren't TODOs), starts a TODO: it and the rest of its line (or block, in the
  editor), up to the next TODO, are highlighted in yellow, the `TODO:` marker in the monospace
  font, semibold, as on the TODOs page. None in code (blocks or inline).
- The sidebar's TODOs page lists them by page (pages by title, TODOs in order, with their
  line), with their count next to it in the sidebar. It follows changes live (a note saved,
  renamed or trashed). Clicking a TODO opens its note in edit mode at that TODO: scrolled to,
  flashed, the cursor at its end; if the note changed since, the TODO with the same text.

## Daily notes

- Optional (Settings › Features, off by default). One note per day, `Calendar/<YYYY-MM-DD>.md`
  in the notes folder (ISO dates, the computer's time zone); weekly notes may come later.
- On, the tree doesn't show them (nor their Calendar folder, when it holds nothing else): the
  sidebar's **Today**, above the pages (with ⌘T on its right in the installed app's window),
  opens today's (highlighted on a day's note), and so do
  ⌘T (installed app) and "Today's note" in the palette. `/daily` and `/daily/<date>` lead to one. Off, they are pages
  like any other, in Calendar.
- A day's note is created when it is opened, empty (no template), by one server call under the
  vault's lock, so that two windows or an agent never make two; a file already there (written
  elsewhere) is read, never overwritten. Left empty, with no history, files or pages, it is
  deleted when the note is left: a day with nothing has no file.
- Its title is its day, not editable: "Today, Wed 21 October" (Yesterday, Tomorrow; the
  year when not this one), in the tab "Today" or "Wed 14 Oct" with a calendar icon. No
  breadcrumb, no creation date. ‹ › (and ⌃⌥← ⌃⌥→, anywhere; ⌥⌘← ⌥⌘→ in the installed app)
  go to the day before and after, ⌃⌥↑ ⌃⌥↓ (and ⌥⌘↑ ⌥⌘↓) a week earlier and later, "Today"
  back to today. ⌃⌥ is for where ⌥⌘← ⌥⌘→ don't reach Tandem: a browser tab (they switch its
  tabs) and Safari's Add to Dock app (it keeps them).
- From one day to another (‹ ›, the shortcuts, the calendar, Today), the day shows in the same
  tab: days don't pile up in tabs, unlike pages.
- The side panel has a **Calendar** tab (daily notes on), selected by itself on a day's note
  (other notes keep their tab): the month, Monday first, ISO week numbers (CW), ‹ › months and
  "Today". Under each day: a dot when its note has something written, a ring when it has to-dos
  left (`- [ ]`), a check when all its to-dos are done. A click opens the day. Below it, on a
  day's note, the keys that browse days and weeks (key chips, as in Docs › Shortcuts): those
  that work there (⌥⌘ ones in the installed app only). It follows changes live.
- Everything else is as in any note: history, authorship, links (`[[2026-10-21]]`), search,
  files, TODOs. Agents: `daily_note` (MCP), `tandem daily`.

## Bookmarks

- Links to websites, kept in Tandem instead of the browser: optional (Settings › Features, off
  by default). Off, the sidebar's section and `/bookmark` go, and the extension says so; cards
  already in notes still show, and agents still use them.
- **Folders and bookmarks**, as in a browser: a bookmark is not a page and holds nothing;
  folders hold bookmarks and folders. Stored in SQLite (and its backup), never in the notes'
  Markdown. A bookmark has a name, a web address (http or https only), an optional
  description, and its site's favicon (`.tandem/icons/`; a globe without one). One bookmark per
  page: an address already saved (give or take `www.`, `http`/`https`, a `#fragment` or a final
  `/`) is refused, naming the bookmark that has it.
- **Sidebar**: a Bookmarks section right after the pages (they scroll together), folded by
  default (open or folded is then remembered). A tree like the pages' (drag and drop, ⌥↑ ⌥↓,
  F2, a menu on each row: open the website, open in a tab, rename, move, copy the address,
  delete); "+" makes a bookmark or a folder (renamed in place). A click on a bookmark or a
  folder opens its **page** in the preview tab, as a page's (a folder also unfolds), and so
  does browsing them with ↑ ↓; a double click or ↵ opens a bookmark's website in a new browser
  tab (from the installed app, in the default browser), a folder's page in a tab of its own.
- **A bookmark's page** (`/bookmarks/<id>`, a tab with its favicon and name): its folders as a
  breadcrumb, then everything **edited in place**, saved when a field is left (↵ in one-line
  fields, Esc puts a field back): name, address (an address already saved is refused, with a
  link to its bookmark), description and folder; its site and dates; the pages showing its
  card, as links; Open website and Delete above. Editing keeps a preview tab open. A
  **folder's page**: its name and the folder it's in, edited the same way, and what it holds
  (a click opens one's page, a double click a bookmark's website), with New bookmark and New
  folder. A deleted bookmark's tab closes.
- **New**: a dialog with the address, name, description and folder. Its name and description
  are read from its page by the server (best effort, a few seconds at most), as its favicon;
  a page already saved offers to show its bookmark instead.
- **Deleting** asks first (bookmarks have no trash), naming the pages that show its card, as
  links: they lose it (each page's history keeps the version with it, and an open note shows
  the change at once). A folder goes with everything in it.
- **Cards in notes**: `/bookmark` picks one (a search over names, addresses and descriptions,
  the latest first; a pasted address that isn't saved yet can be added from there), and a
  bookmark dragged from the sidebar into a note becomes one. A card shows the bookmark as it is
  now (favicon, name, site, two lines of description). A click selects it (framed, as any
  block) and opens its menu, also on its ⋯ button: open the website, the bookmark's page, put
  another bookmark there, remove the card; the focus stays in the note, so ⌫ deletes the
  selected card and ⌘Z brings it back, as any content. A double click opens the website. The
  note only has a block naming it (` ```bookmark ` with `id: …`); a card whose bookmark is gone
  says so.
- **Chrome extension** (`packages/extension`, shipped in the installed app's folder and loaded
  unpacked: Docs › Browser Extension). Its button (or ⌥⇧D) opens a popup with the page's name (its
  title), address and description (its meta tags; the field grows with the text), Cancel and
  Create; its favicon is the browser's. No folder to pick: new bookmarks go to the top, sorted
  in the app. Create closes the popup at once and the button shows ✓; the save goes on behind
  (a failure turns the ✓ into a red ! that says why). A page already in Tandem shows "Already
  in Tandem" and edits its bookmark (Save, the same way), and the button shows ✓ on it. In the address bar, `tb` then Tab
  searches the bookmarks; ↵ opens one. Tandem not running at its address (options; default
  `http://localhost:3864`), or bookmarks off: the popup says so, and how to fix it (the
  extension can't start Tandem; the login item restarts it anyway). Chrome only for now.
- **Importing Chrome's bookmarks** (the extension's options, "Import Chrome's bookmarks"): Chrome
  asks to let the extension read them (asked then, not when it's installed). The whole tree
  (bookmarks bar, other bookmarks, mobile bookmarks, their folders, with Chrome's names; a top
  folder without bookmarks left out) goes into a "Chrome" folder at the top of Tandem's
  bookmarks, each bookmark with its favicon from Chrome (none when Chrome only has its generic
  one: Tandem shows its own). In one change, announced once. Importing again merges: folders of
  the same name (any case) are reused, pages already in Tandem (anywhere) are kept as they are,
  and what isn't a web page (bookmarklets, `chrome://`) is left out; the options say how many
  were imported, already there, left out. Chrome's bookmarks aren't changed. At most 20 000 at once.
- Exporting bookmarks, and Safari, may come later.

## Interface

- Nuxt UI Dashboard layout: sidebar (search, Today when daily notes are on, tree, Bookmarks when on; TODOs and Trash when on, Settings and Docs at the
  bottom, then the app's version, the open note's save status ("Saving…", "Saved just now"; its icon alone, the text in a tooltip, when the sidebar is collapsed) and collapse; the logo leads Home), one bar above the page (the tabs, and the page's actions: for a note its modes, side panel
  and ⋯), editor,
  collapsible right panel (Headings, Links, History, Files, Databases: icon tabs
  named by tooltips; below 1024px it takes the whole width, replacing the note while open), resizable from its left
  edge like the sidebar from its right one (remembered; a double-click on the edge resets it). Full-width toggle.
  The Headings panel highlights the heading being read; one picked in it stays highlighted until the
  note is scrolled.
  Keyboard shortcuts throughout.
- **Tabs**, as VS Code's editors, in the page's bar, left of its actions (a note's side panel
  has its own header on the same row). Notes open in tabs, and so do Settings, Docs (one tab,
  which remembers its section), TODOs and the trash; Home has none, and shows its title when no
  tab is open. The page shown is always the active tab.
  - Tabs sit side by side, split by thin vertical lines (hidden next to the tab under the
    pointer and the active one, and after the last tab), as a browser's; the active one is tinted with the accent color.
    Their × only shows on hover (or keyboard focus), over the end of the title, which fades out
    under it: it takes no room. They are 28px high, on up to two rows of
    the bar: a single row is centered, a second one is used once the first is full. Those that
    don't fit are in a "+N" menu at the end; the active tab is always shown, in the last place
    shown when its own place is hidden (the tabs' order doesn't change). On a phone, one row
    that scrolls sideways, keeping the active tab in view. Hovering a tab shows its page's
    path (the pages it is in, with their icons).
  - A click in the tree opens a note in the **preview tab**: in italics, one at most, replaced
    by the next preview (in its place), and closed once another page shows (another tab,
    Home…; a tab opened then takes its place). Unlike VS Code, where it stays. It becomes a tab of its own with a double click in the
    tree or on the tab, an edit of the note (a change to save, or a new title), or "Keep open"
    in its menu. Opening a note any other way (search, links, TODOs, Home, a new page) gives it
    a tab of its own. A new tab opens right of the active one; a note already open just shows.
  - Closing: the tab's × (on the active tab and on hover), a middle click, ⌘W (in the installed app; with no tab open, ⌘W closes Tandem, the browser asking first), or the tab's
    menu (a right-click: Close, Close others, Close to the right, Close all; Keep open for the
    preview; Copy path for a note). Closing the active tab shows the tab used most recently;
    closing the last one shows Home. ⌘⇧T reopens closed tabs, last first (up to 20). ⌘N (and ⌥⌘N) makes a new page next to the open one: the same parent, right after it (a folder too: inside is the row menu's "New page inside"); with no note open, at the top level. ⌘T opens today's note with daily notes on, and makes a new page like ⌘N with them off. The sidebar's "+" and Home's button make one at the top level. In a browser tab, ⌘W, ⌘N, ⌘T and ⌘⇧T stay the browser's.
  - ⌃⌘→ / ⌃⌘← go to the next or previous tab (wrapping around), always (on a Mac: elsewhere
    it would be the system's Win+Ctrl); ⌥⌘→ / ⌥⌘← too, except on a day's note, where they go to the next or previous day; ⌃1…⌃8 to that tab and ⌃9 to
    the last one (⌘1…9 belong to the browser). Tabs are dragged to reorder them,
    from one row to the other too. A double click on the bar's empty space makes a new page.
  - A note moved to the trash or deleted (here or by an agent) loses its tab. Renamed or moved,
    its tab follows (title, icon). The tabs, their order and the recently used ones are kept in
    the browser: opening Tandem on Home shows the tab that was active. Switching notes folders
    closes them all.
- VS Code editing shortcuts: move blocks and list items (⌥↑/⌥↓), duplicate them (⇧⌥↑/⇧⌥↓),
  delete them (⌘⇧K), insert a line below or above (⌘↵ / ⌘⇧↵), and select occurrences of a
  word (⌘D, ⌘⇧L) to type, erase or delete in all of them at once (Esc goes back to one
  selection; pasting into several isn't supported).
- Find in the note (⌘F, ⌘⌥F with replace), as in VS Code: highlighted matches, count, next /
  previous, match case, replace and replace all. The current match is always scrolled into view
  (a third down the note), however far it is. ⌘⇧F opens the search across all notes, with the
  selected text.
- Pages and bookmarks trees: a row's title takes its whole width (cut with an ellipsis when
  too long); its buttons (menu, new page inside) show on hover or focus, over the title's end,
  which fades out under them, as a tab's ×.
- Pages tree from the keyboard: arrows to move and expand (↑ ↓ preview the page reached, as a
  click does, once they pause), ↵ to open it in a tab of its own (as a double click), F2 to rename, ⌥↑/⌥↓ to
  reorder, ⌘⌫ to move to the trash. Moving to the trash from the tree has no confirmation: the
  message that follows offers Undo (as ⌘Z does). With the trash off, it asks, then deletes forever.
- **The website**, <https://tandem.w3lt.org>, is the landing page, not part of the app (which
  has none): it presents Tandem and leads to installing it and to GitHub, never to an app.
  Header: the GitHub icon and "Install" (to the hero's command). Hero: the one-line install
  first, then "See what's inside" and "View on GitHub" (with the icon); the page ends with the
  command again, and the footer links to it, the releases and GitHub (with the icon). The
  one-line install is a dark terminal line in both modes, with a
  copy button saying "Copied", or, where the browser refuses to copy, selecting the command and
  saying which keys copy it; it scrolls sideways on narrow screens, and links to the latest
  release for company networks). Then a note written live by the owner and an agent, the
  features, the agents' CLI and MCP, the files, then "Feels like your code editor": VS Code
  shortcuts, the code themes (a snippet in each in turn; a click on a theme's name picks it) and
  multiple tabs, marked "Coming soon". Animated, in the accent color and
  both modes; with reduced motion, every demo shows its final state. It asks nothing of a
  Tandem server.
- Docs (sidebar, ⌘⇧F palette), in tabs with their own addresses (`/docs/<tab>`):
  - **Install**: installing Tandem as an app (the browser's install button, or Safari's steps;
    "Installed" in the app), removing it, where Tandem runs (this address, local only), and
    updating Tandem: the one-command install, with a copy button (or a newer download's
    installer), and how to uninstall.
  - **Concepts**: in three groups. Organize: pages and folders, tabs, icons and tags, search.
    Write: Markdown on disk, autosave and conflicts, links, files, databases, bookmarks, daily
    notes, TODOs. Keep track:
    authorship, history, trash. Agents have their own tab.
  - **Security**: who could read the notes, and what to turn on against each: someone with the
    computer or its disk (FileVault, an encrypted Time Machine disk), the cloud the notes
    folder syncs with (iCloud's Advanced Data Protection; other drives aren't end-to-end
    encrypted), websites visited (Tandem answers only to its own address and takes changes
    only from its pages and its extension), apps and agents on the computer. Tandem doesn't encrypt notes itself, and says
    why, and where the notes' text is (the notes folder, its `.tandem`, Tandem's database).
  - **Blocks**: every block and inline element the editor writes, grouped (text, lists,
    blocks, files), each shown by the editor itself (read-only) next to its Markdown, as saved,
    with how to add it (`/` menu item, typed Markdown, keys). Links and files there lead
    nowhere; a database's and a bookmark's examples are drawings (their data isn't in the
    Markdown).
  - **Agents**: the MCP command at Tandem's own address and the CLI, both with a copy button,
    what agents can do, and their guide (`docs/agents.md`).
  - **Browser Extension**: setting up the Chrome extension (bookmarks on, Developer mode, Load
    unpacked with the installed app's extension folder, shown with a copy button to paste it in
    Chrome's dialog with ⌘⇧G, pinning it, its address when Tandem isn't on 3864) and using it
    (importing Chrome's bookmarks too).
  - **Shortcuts**: every shortcut and typing rule; ⌘/ opens it from anywhere. Only the keys
    that work where it is shown: in a browser tab, not those the browser keeps (⌘N, ⌘T, ⌘W,
    ⌘⇧T, ⌥⌘← ⌥⌘→: a line says the installed app has them); in the installed app's window
    (Chrome's app, Safari's Add to Dock), those too. Menus and tooltips do the same (⌘N for a
    new page and ⌘W in a tab's menu in the app; ⌥⌘N and no key in a browser tab). The tree's
    menu shows the shortcuts of its actions.
    `/docs` opens Install; the old `/shortcuts` address leads to Docs › Shortcuts.
- **Settings**, in tabs with their own addresses, as the Docs (`/settings` opens General; the
  TODOs and Trash pages and Home's Settings button lead to their tab):
  - **General**: the workspace name (next to the logo and in the browser tab; Tandem by
    default), the owner's display name, the notes folder, whether Home lists the recently
    updated pages (on by default); it ends with links to Docs › Install
    and Agents (installing the app, connecting agents).
  - **Appearance**: light, dark or system color mode (a small preview of each), background
    tone (white, paper, sepia or cool, each with a light and a dark variant), primary (amber by
    default) and neutral colors, corner radius, and whether shortcuts' keys show in the app
    (buttons, menus, tooltips, palette, Home; on by default). Off, they still work, and Docs
    (Shortcuts, Blocks) still show them.
  - **Editor**: font, text size (notes only: the interface keeps its size), page width, and
    the code blocks' theme (Tandem, GitHub, One, Dracula, Nord, Solarized or Tomorrow: each a
    light and a dark variant, used in its mode, as the background tones; Tomorrow's dark one is
    Tomorrow Night Eighties, both as VS Code's "Tomorrow and Tomorrow Night Operator Mono"
    theme).
  - **Features**: optional parts of the app, each a switch: tags (off by default), the trash
    (on), TODOs (off), daily notes (off) and spell check (the browser's, while typing in notes,
    titles and fields; off; never in the Markdown source). Turning one off only hides it: tags
    stay on their notes, TODO lines in theirs, and turned back on they show as before; agents
    (MCP, CLI) keep every feature.
- The logo (sidebar and browser tab) is drawn in the accent color: your page in front, its lines
  in your color and the agent's amber, the agent's amber page behind. The installed app's Dock icon is the default (amber) logo: macOS keeps the image it
  got at install.
- Installable as an app (web app manifest): its own window and Dock icon. Its title bar takes
  the page's background color (tone, light or dark: `theme-color`), from the first frame. In a browser tab
  that can install it, the sidebar offers to (the logo, "Install Tandem"): Chrome and Edge
  show their install dialog; Safari, which has none, gets the steps (File › Add to Dock…, or
  Share › Add to Home Screen on iOS). Closing the offer hides it for good; Docs › Install still
  offers to install, or says it's installed. Hidden in the installed app and in browsers that
  can't install.
- English interface; French formats for dates, times and numbers (`17/10/2026 14:32`).
- Must feel instant: local-first interactions, optimistic updates, no full-page loads.

## Out of scope (for now)

Templates, export (PDF/HTML), daily notes, favorites, search inside attachments, multiple
computers on one data folder, authentication (bound to 127.0.0.1 only). For databases:
relations, formulas, other views (board, calendar), per-database history, converting a table
into a database. For bookmarks: importing and exporting the
browser's, Safari.
