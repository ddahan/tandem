# Architecture

How Tandem is built. What it does and why is in [SPEC.md](SPEC.md); how to work on it is in
[AGENTS.md](../AGENTS.md).

## Overview

```
 Browser (Nuxt SPA) ──HTTP /api, SSE /api/events──┐
 Agents ─────────────HTTP /mcp (MCP) ─────────────┤
 CLI (`tandem …`) ───────HTTP /api ──────────────┤
                                                  ▼
                                   Hono server (packages/server)
                                         │  Vault (one lock)
                     ┌───────────────────┼────────────────────┐
                     ▼                   ▼                    ▼
           Markdown files          SQLite (node:sqlite)   File watcher
           <data folder>           app folder or Docker   (chokidar) → reconcile
                                   volume, backed up to
                                   <data>/.tandem
```

One process serves everything: the API, the MCP endpoint, attachment files (`/files/…`) and the
built web app. In Docker and development it runs TypeScript directly (Node's type stripping:
no build step for the server, the CLI and the shared package); the standalone app is the same
code bundled into one JavaScript file, run by the computer's Node (below).

## Packages

| Package               | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `packages/shared`     | Types of the API's data; rules both sides apply (titles, wiki links, authors, French formats) |
| `packages/server`     | Vault, database, search, history, watcher, Hono API, MCP server, entry point                  |
| `packages/cli`        | The `tandem` CLI (a typed client of the API)                                                  |
| `packages/web`        | Nuxt 4 single-page app with Nuxt UI; editor extensions; Playwright tests                      |
| `packages/standalone` | The standalone app: one JavaScript bundle (server + CLI) with the web app, its build          |
| `packages/extension`  | The Chrome extension (bookmarks): popup, service worker, options; built with esbuild          |

The web app and the CLI use the server's API through Hono's typed client
(`@tandem/server/client`): route types flow from the server to its clients.

## Data

### Files (source of truth)

- A page is `Title.md`; its child pages are in `Title/`; its attachments in `Title.assets/`.
- A folder without a same-named page is a folder node: to the user, a page without content
  (`TreeNode.empty`; the web app shows a blank page with child pages as a folder, `kindOf`).
  When `X.md` appears next to a folder `X/`, the page takes the folder over (its contents
  become child pages). The vault does the same when a folder is written to (`folderToPage`:
  same row, so id, icon, position and history stay), and the reverse when a page with child
  pages is saved blank (`pageToFolder`, after snapshotting its text). There is no API to create
  a folder: pages only.
- Titles are file names (`sanitizeTitle` in shared), unique per folder, case-insensitively,
  pages and folders together.
- Writes are atomic (temporary file + rename). Hidden files, `~$…` Office locks and our
  temporary files are ignored everywhere.

### Database (`packages/server/src/db/schema.ts`)

| Table                        | Contents                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodes`                      | Pages and folders: id, path, order, dates; for pages the last known content, hash, mtime/size, editing session (last author, last save, pending snapshot) and line authorship |
| `tags`                       | Tags of nodes                                                                                                                                                                 |
| `links`                      | Wiki link targets of each page (normalized with `linkKey`)                                                                                                                    |
| `versions`                   | History metadata; contents in `<data>/.tandem/history/`                                                                                                                       |
| `trash`                      | Deleted items, with the rows needed to restore them                                                                                                                           |
| `settings`                   | The owner's settings (JSON values)                                                                                                                                            |
| `databases`                  | Databases: page (`node_id`, no foreign key: a page in the trash has no row), title, columns, sort and filters (JSON)                                                          |
| `database_rows`              | Their rows: order (`position`), values by column id (JSON); deleted with their database                                                                                       |
| `nodes.icon`                 | Custom icon of a page or folder: `emoji:<emoji>` or `image:<file>` (in `<data>/.tandem/icons/`, served at `/api/nodes/:id/icon`); the API returns a `NodeIcon`                |
| `notes_fts`, `notes_trigram` | FTS5 indexes (words; trigrams), filled by the vault                                                                                                                           |
| `search_rows`                | The rowid of each page in both FTS5 indexes (FTS5 can't index `node_id`): updates and lookups by page go straight to its rows                                                 |
| `bookmarks`                  | Bookmarks and folders: parent folder, order, title, address and its duplicate key (`url_key`, `urlKey` in shared), description, favicon (`image:<file>` in `.tandem/icons/`)  |
| `bookmark_refs`              | The bookmarks each page shows (its ` ```bookmark ` blocks), filled when a page is indexed, as `links`                                                                         |

- Drizzle (`sqlite-proxy` driver over `node:sqlite`: no native module). Migrations are in
  `packages/server/drizzle/`, generated by `drizzle-kit generate`; the FTS tables are a custom
  migration (`drizzle-kit generate --custom`).
- The live database is on a Docker volume (`TANDEM_DB_PATH`). `VACUUM INTO` writes a
  consistent copy to `<data>/.tandem/tandem.db` a minute after changes and on shutdown;
  `openDatabase` restores it when the live file is missing.
- Why keep content in `nodes`: an external edit has to be diffed (authorship) and snapshotted
  (history) against what the file contained before it changed.

## The vault (`packages/server/src/vault/vault.ts`)

All operations go through one `Vault` and run inside a FIFO lock (`lock.ts`), so requests from
the web app, agents and the watcher never interleave. Internal methods (`saveInternal`,
`relocate`, `reconcileInternal`…) assume the lock is held; public methods take it.

### Saving (`saveInternal`)

1. If the page has an editing session pending and this save ends it (another author, or idle
   for `sessionIdleMs`, 30 s), the previous content is **snapshotted** into history.
2. **Authorship** is updated: line diff (`blame.ts`) between the previous and new content;
   unchanged lines keep their author. Lines are compared after `normalizeLine`, which ignores
   formatting-only changes made by the editor's serializer (bullet style, escaping, table
   padding…) and list numbers. A removed line found again among the added ones (same save)
   was moved: it keeps its author.
3. The file is written (unless the change came from the file itself), the row updated, the page
   reindexed (search, links) and a `note` event emitted.

`flushIdleSessions` (every 10 s) snapshots sessions that ended without another save.
`thinHistory` (every 6 h) keeps all versions for 7 days, one per day for 90 days, then one per
week.

### Conflicts

The web app sends `baseHash` (the hash it started from) with each save. If the file changed
since (an agent wrote), the server answers 409 with the current content; the editor shows a
banner (keep mine, take theirs, compare).

### Renaming and moving (`relocate`)

Moves the page's file, children folder and attachments folder, updates the paths of every node
below, rewrites the page's own attachment links when its title changes, then rewrites wiki
links (`[[Old]]`, `[[Folder/Old]]`) in the pages that pointed to any moved page. Those rewrites
are saves by the author of the move.

### Reconciling with the files (`reconcileInternal`)

Runs at startup and after file system events (debounced by `watcher.ts`): new files become
pages (author `external`), missing files are deleted, a new file with the content of a missing
one is a **move** (it keeps its id, tags and history), changed files (mtime/size, then hash) are
saves by `external`, folders are created and removed. Our own writes update mtime/size first,
so the watcher's echo is a no-op.

### Search (`search.ts`)

- Words become prefix queries (`"word"*`) on `notes_fts` (unicode61, diacritics removed),
  phrases stay exact, `-word` excludes; `tag:` and `in:` filter afterwards.
- Ranking: BM25 with weights title 10, attachments 4, body 1; up to +25% for recent notes.
- A word with no indexed prefix is replaced by the closest indexed word (Damerau-Levenshtein,
  1 edit up to 6 letters, 2 above), preferring frequent words; the response says so.
- When word matches are fewer than the limit, `notes_trigram` adds substring matches below them.
- Snippets come from FTS5 `snippet()`, HTML-escaped, with `<mark>` around matches. They are
  computed after ranking, only for the results returned (one query per index).

### Performance

`./td pnpm --filter @tandem/server bench [pages]` generates a vault (5,000 pages, 26 MB by
default), imports it and times the main API calls. Rules that keep these times flat as vaults
grow:

- Listings use `allRows()`, which returns `NodeMeta` (no `content`, no `blame`): a page's
  content is loaded only for that page (`requireRow`).
- Never scan the FTS5 tables by `node_id`: go through `search_rows`.
- Prepared statements are cached (the Drizzle proxy in `db/client.ts`, `SearchIndex`).
- SQLite runs in WAL with `synchronous = NORMAL` (safe in WAL; a power cut can only lose the
  last commits, which the files and the next reconcile restore).

### Trash

Deleting moves the files into `.tandem/trash/<id>/` and the rows into the `trash` table
(pending sessions are snapshotted first). Restoring puts both back (renaming to
`Title (restored)` if the name is taken). Deleting forever removes the files, the history
folders, the versions and the pages' databases (ids are kept through the trash, so databases
just wait for their page). With the trash off (a setting), the web app deletes a page forever
in two calls, to the trash then out of it (`useTree().deleteForever`): the server has one way to
delete, and agents keep the trash.

### TODOs

`findTodos` (shared, `todos.ts`) reads a note's TODOs from its Markdown, code masked as for wiki
links. `listTodos` runs it on the pages whose stored content has `TODO:` (`instr`, case
sensitive): no table to keep in sync. The editor (`editor/todos.ts`) decorates the same
ranges (`todoRanges`, on each text block's text, inline code blanked), so both agree; its
`revealTodo` command goes to the n-th one (or the first with the same text) and flashes it.
With TODOs off (a setting), the decorations stay and CSS (`html[data-todos='off']`, set by
`useSettings`) draws them as plain text, so the editor isn't rebuilt; the layout stops loading
them (`useTodos().follow`).

### Daily notes

`shared/calendar.ts` holds the rules: `Calendar/<YYYY-MM-DD>.md` (`calendarPath`,
`calendarDateOf`, any case, as a Mac's disk), ISO weeks, labels, to-do counts. Day notes are
ordinary rows and files, so history, search, links and agents need nothing new. The vault adds
`calendarNote` (find or create, under the lock: a file not read yet is reconciled first, its
folder is a Calendar folder or the pages of a Calendar page), `calendarMonth` (the marks: written,
to-dos left and done, from the stored content) and `dropEmptyCalendarNote` (only empty, with no
history, attachments or pages; its folder goes with its last note). API: `POST /calendar/:date`,
`GET /calendar?month=`, `DELETE /calendar/:id`; MCP `daily_note`, CLI `tandem daily`. The web
app hides them from the tree (`useTree`, daily notes on), opens days with `useDaily`, shows
`SideCalendar` in the side panel, and drops an empty day when its page unmounts. Going from
one day to another keeps the tab: `useTabs().replace` gives the active tab the new page at once
(before the router shows it), and ⌥⌘← ⌥⌘→ step days on a day's note (tabs elsewhere), ⌥⌘↑ ⌥⌘↓ weeks. Steps
pressed faster than days open queue: each counts from the day on its way, waits for the page
before it to show (`page:finish`: a switch started while the last page loads can end on the
earlier one), and one superseded by a newer press is skipped.

### Optional features

Shortcuts' keys hide with one rule in `main.css` (`html[data-shortcut-hints='off'] kbd`, but not
under `[data-keys-shown]`: Docs), set by `useSettings`, so no component needs to know.

`tags`, `trash`, `todos`, `bookmarks`, `daily` and `spellcheck` are settings like the others
(`Settings`, shared): the web app shows or hides what each one governs, and never changes the
data (tags stay in SQLite, TODO lines in the Markdown). The server and agents ignore them, with
one exception: bookmarks off, the server answers the browser extension's bookmark requests
(its `Origin`) with a 409 and the code `bookmarks_off`, so that the extension can say so
(`GET /api/bookmarks/status` tells it first).

### Databases (`databases.ts`)

`DatabaseStore` keeps databases in SQLite; the vault runs it under its lock and announces each
change (`database` event). Every change returns the whole database (rows included). Values
are checked with `toCellValue` (`@tandem/shared`'s `databases.ts`); a column changing type
converts its values (`convertCell`), and one becoming a `select` takes its values as choices.
The view (filter, then sort: `viewRows`) is applied by readers, in the same shared code: the
table, the agents' tools and the CLI show the same rows. Column ids stay when columns are
renamed. A note only holds ` ```database ` + `id:`; `databaseIdsIn` finds them.

### Bookmarks (`bookmarks.ts`, `web-pages.ts`)

`BookmarkStore` keeps bookmarks and folders in SQLite; the vault runs it under its lock and
announces changes (`bookmarks` event). Order is a position among siblings, renumbered on each
move. Duplicates are found by `url_key` (shared `urlKey`: no scheme, `www.`, fragment or final
`/`); the vault refuses them with a `DuplicateBookmarkError` naming the bookmark (409). Folders
can be given by path (`Work/Tools`, made if missing: agents). Search runs in memory over every
bookmark (a few thousand at most), reading queries with the notes' `parseQuery`: prefixes in
the title (weighted most), the address and the description, then substrings of three letters
or more, typos replaced by the closest word (`editDistance`).

`indexPage` records the bookmarks a page shows (`bookmarkIdsIn`) in `bookmark_refs`, as wiki
links in `links`; a page in the trash has none (the rows go with it), and gets them back when
restored. Deleting a bookmark (or a folder, with its contents) removes its blocks from those
pages (`removeBookmarkBlocks`), saved as the one deleting, after a snapshot of an editing
session in progress so that the history keeps the cards; then its rows and favicon files.
The server credits the web app's changes to the owner, which an open note doesn't reload (its
own saves): the web app announces `cards-removed` for the pages it changed
(`useServerEvents`' `announce`), and they reload.

What isn't given when a bookmark is made (title, description, favicon) is read from its page:
`web-pages.ts` fetches its head (5 s, 1 MB at most), reads `<title>`/`og:title` and the meta
description, then the first declared favicon that loads (or `/favicon.ico`, 512 KB at most).
The vault only fetches with a `fetch` given (the server's; none in tests, unless faked). The
extension sends the browser's favicon instead (a `data:` URL). `POST /api/bookmarks/preview` is
a POST: it makes the server fetch, which only Tandem's own pages may ask for (the guard).

## HTTP

- Every request goes through `api/guard.ts` first. Tandem has no authentication and any web page
  the owner visits can send requests to localhost: the `Host` must be the computer's own
  (localhost, `*.localhost`, 127.0.0.1, [::1], plus `TANDEM_ALLOWED_HOSTS`, the dev servers'
  container name `server`), which defeats DNS rebinding (a site whose name now points to
  127.0.0.1 is its own origin for the browser, but still names itself); and changes (anything
  but GET and HEAD) need no `Origin` (the CLI, agents), a local one (the app, its dev server) or
  the extension's (`EXTENSION_ORIGIN`, fixed by the public key in its manifest). Otherwise 403.
- `/api/*` (`api/index.ts`): internal JSON API; validation with zod (errors → 400), vault
  errors → 404/409/400. The author is the `X-Tandem-Author` header (`owner` from the web app,
  `agent` by default).
- `/api/events`: Server-Sent Events (`tree`, `note`, `trash`, `settings`, `database`,
  `bookmarks`), with a ping every 25 s.
- `/api/bookmarks…`: the bookmarks (above); `/api/extension`: the extension's folder, when the
  app has one (the standalone app's `extension/`), for Docs › Browser Extension.
- `/files/<path>`: files of the data folder (never hidden ones), with ETag, and a CSP that keeps
  SVG scripts from running.
- `/mcp` (`api/mcp.ts`): MCP over Streamable HTTP, stateless (one MCP server per request,
  carrying the request's author).
- `/health`, and the web app's static files (`/_app/`) with a fallback to `index.html`. Pages
  are never stored (`no-store`: Safari's Dock apps reopened a stored page, so the old version);
  the other files are revalidated (`no-cache`, an ETag answers 304), content-named ones too:
  Vite writes stylesheet names into scripts after naming them, so a script can change and keep
  its name.

## Web app (`packages/web`)

- Nuxt 4 with `ssr: false`, built with `nuxt generate`, served by the server. In development,
  Nitro's dev proxy forwards `/api`, `/files` and `/mcp` to the dev server.
- Layout: `UDashboardGroup` with a sidebar (search button, `NoteTree`, navigation, color mode),
  the search palette (`NoteSearch`, the only search; `useSearchPalette` opens it with a query),
  and pages made of `UDashboardPanel`s. The note page adds `NoteSidePanel` (headings, links,
  history, files). The editor reports the heading being read (`currentHeading`: measured on
  scroll, from heading positions, not anchors); Nuxt UI's `ContentToc` needs Nuxt Content.
- Bookmarks: `useBookmarks` (all of them, shared by the sidebar's `BookmarkTree`, the cards,
  the palette and the tab bar; loaded even when off, for cards already in notes),
  `useBookmarkActions` (dialogs, made when first opened: `BookmarkDialog` for a new one,
  `BookmarkPicker`, `BookmarkDeleteDialog`), and `pages/bookmarks/[id].vue`, a bookmark's or
  folder's page, edited in place (tab key `bookmark:<id>`, `utils/tabs.ts`; `forgetBookmarks`
  closes the tabs of deleted ones). The block is `editor/bookmark.ts` (Markdown, and a drop handler for bookmarks
  dragged from the sidebar: `application/x-tandem-bookmark`) with `BookmarkView.vue`.
- State: `useTree` (tree, shared), `useSettings` (applies colors, radius, font and width at
  runtime; remembers the last settings in the browser and applies them before the first paint,
  so a reload never flashes the default theme: plugin `remembered-settings.client.ts`, and a
  head script for the background tone), `useServerEvents` (one EventSource; `resync` after reconnections),
  `useNoteDocument` (one open note: debounced background saves, never two at once, conflicts,
  external changes, a keepalive save when the page closes).
- Editor (`NoteEditor.vue`): `UEditor` in Markdown mode plus our extensions
  (`app/editor/`): wiki links, callouts, details, resizable images, file chips, file drops,
  tables, task lists, code blocks with lowlight (colored by the code theme: CSS variables per
  `data-code-theme` and color mode in main.css, set on `<html>` by `useSettings`; a theme
  saved under an older name is read as its pair). Each has Markdown parse/render rules,
  unit-tested for round-trips (`test/markdown.test.ts`). Node views (code blocks with language
  picker, copy and Mermaid preview; callouts with a type picker) are Vue components.
- Attachment paths: notes use paths relative to themselves; the editor gets `/files/…` URLs
  (`utils/markdown-paths.ts`), converted back on save, and `normalizeMarkdown` tidies blank
  lines the serializer adds.
- Lists: `editor/list-keys.ts` takes Tab, Shift+Tab, Enter in an empty item, Backspace and
  Delete before TipTap's list keys, which look for the nearest item of their own type (in a
  bullet nested in a to-do, Shift+Tab lifted the to-do) and lose the kind across levels:
  moving between a to-do level and a bullet or numbered one changes the item's type.
  `editor/list-markers.ts` handles typed markers, `editor/join-lists.ts` merges adjacent lists
  of a kind. `editor/ordered-list.ts` replaces TipTap's numbered-list Markdown parser (a copy
  with two fixes: a numbered line under a bullet or to-do line of an item is that list's, and
  an item's content starts after its whole marker). `normalizeMarkdown` drops empty items.
  `test/lists.test.ts` holds the rules, for every pair and triple of kinds.
- Every editor (the note's, the Docs' examples, the loss check, the tests) gets its own marked
  parser (`markdownOptions()`): by default TipTap's Markdown extension registers its syntax on
  marked's single shared instance and never removes it, so each editor opened slowed every later
  parse and stayed in memory (pages got slower over a session).
- Markdown the editor would lose (`utils/markdown-loss.ts`): a headless TipTap editor with the
  same extensions parses the note and saves it again (`editorRoundTrip`); the lines whose words
  or HTML tags (except those with their own node) are missing afterwards are losses. On
  opening a note, the visible editor's first reading stands for that trip (`lostLines` on its
  `getMarkdown()`, as soon as it exists): a second, hidden editor would parse the note twice.
  The note page also checks while the Markdown view is typed in (debounced), with `editorRoundTrip`;
  `NoteEditor`'s `readOnly` goes to the TipTap editor (`setEditable`: UEditor reads `editable`
  once). The Markdown view (`MarkdownSource.vue`) numbers its lines: each number is as tall as
  its wrapped line, measured in a hidden copy of the text with the same width and font.
- Databases: `editor/database.ts` is an atom block read from and written to the fenced block
  (its own Markdown tokenizer, before code blocks); `components/editor/DatabaseView.vue` draws
  it (title, sort and filter controls, the table with a menu per column), with
  `DatabaseCell.vue` (native controls for text, numbers and checkboxes, Nuxt UI's `USelect`
  for choices; a draft while edited: the table reloads with every change; text cells are
  textareas sized by a hidden copy of their text in the same grid cell; dates:
  `DatabaseDate.vue`, Nuxt UI's `UInputDate` with a `UCalendar` popover,
  locale `en-GB` for day-first dates and English words) and `DatabaseFilters.vue`. The table
  has a fixed layout: each column's `<col>` has its saved `width` or a default for its type,
  and the table is `max(100%, sum of widths)` wide. Each block reports that sum to the note's
  page (`BLOCK_WIDTHS`, provided by `pages/notes/[id].vue`), which goes full width while one
  is wider than the text column. `useDatabase` loads one, reloads it on its
  `database` events (only the latest load counts) and changes it through the API. The slash
  menu creates the database first, then inserts its block where the cursor was.
  `SideDatabases.vue` lists the note's blocks (`databaseIdsIn` on its Markdown) with titles
  and row counts.
- Block handle (`UEditorDragHandle`, nested: list items move one by one): its distance from
  the block is computed in Floating UI's `offset` (`handleOptions` in `NoteEditor.vue`), which
  adds the marker margin of bullet and numbered items. TipTap's Vue handle ignores a custom
  reference element, so the offset is the only way in.
- Authorship view: the content split into blocks with marked (`utils/authorship.ts`), each
  block given the latest author of its lines, rendered with `utils/render-markdown.ts`
  (sanitized).
- Editing shortcuts in the VS Code style: `editor/block-keys.ts` (move, duplicate, delete,
  insert blocks, on `NodeRange`s so list items move within their list) and
  `editor/find.ts` with `FindBar.vue` (⌘F: query, matches and current match in plugin state,
  decorations, replace), `editor/occurrences.ts` (⌘D: extra selections kept in plugin state, mapped through changes,
  drawn as decorations; typing, Backspace and Delete apply to all of them). Docs › Shortcuts
  (`pages/docs/shortcuts.vue`) reads `utils/shortcuts.ts`, the list of every shortcut.
- Tabs (`composables/useTabs.ts`, `components/TabBar.vue`): the route is the active tab. The
  layout calls `show(route)` on each navigation, which opens a tab for it or updates the one
  with its key (`note:<id>`, or an app page's name); the tree's single click calls `preview`,
  which marks that path as the next preview (`pendingPreview`, tied to the path so that a
  double click arriving before the navigation, or another navigation, isn't taken for one).
  `keepOpen` is called by a double click, by the note page when its document becomes `pending`
  (an edit, not the load), and when its title changes. Closing picks the most recently used
  tab (`recent`). The list and `recent` are one `useState` value, written to localStorage on
  each change; the layout closes the tabs of notes missing from the tree once it is loaded.
  Every page's bar is `PageNavbar` (Nuxt UI's navbar): `TabBar` in its left slot, the page's
  actions in its right one, the title when no tab is open. `TabBar` fits the tabs on two rows:
  it renders them all, counts the rows (distinct tops: rows are centered, so they move as tabs
  come and go, and are never compared with an earlier layout), then shows fewer until they and
  "+N" take two rows; again when the titles, order, active tab or the bar's width change
  (a resize observer). The active tab replaces the last one shown when hidden, for display
  only: drag positions are among the tabs shown, and the move (`moveBefore`) is in the full
  order.
- App shortcuts (`layouts/default.vue`): ⌘W, ⌘N, ⌘T and ⌘⇧T only reach the page in an installed
  app's window (browsers reserve no keys there); ⌘W is a plain keydown listener, not
  `defineShortcuts` (which always prevents the default): with an active tab it prevents the
  default and closes it, with none it lets the window close and adds a `beforeunload` handler
  for that second only, so the browser asks first. ⌘B uses `defineShortcuts`' default (not in a
  text field or the editor, where it is Bold); ⌥⌘B works everywhere. Text that names shortcuts
  in Docs goes through `utils/platform-keys.ts` (`keysText`: ⌥⌘W on a Mac, Ctrl+Alt+W
  elsewhere); key chips (UKbd) already adapt.
- Copy buttons (landing install command, Docs) use `utils/copy-text.ts`: the Clipboard API,
  then `execCommand('copy')` on a hidden field when it is refused (frames, permissions).
- Docs (`pages/docs.vue`, a tab per child page in `pages/docs/`, `/docs` and the old
  `/shortcuts` redirecting with `definePageMeta`). Settings are built the same way (`pages/settings.vue`, its tabs in
  `pages/settings/`, saving through `useSettingsSave`). Blocks shows each entry of
  `utils/docs-blocks.ts` in `DocsExample.vue`: a read-only UEditor with the note editor's
  extensions and node views, so the tour can't drift from what notes show; a unit test checks
  each example's Markdown round-trips unchanged. A database's data isn't in its Markdown, so its
  example is drawn.
- Startup bundle: large, rarely needed code loads on demand. The emoji list (~500 KB) loads
  with the icon picker (`LazyIconPicker`) or after a note opens (the `:` menu), Mermaid when a
  diagram shows. Check what a change adds to the startup files (`index.html`'s scripts) after
  `nuxt generate`.
- Icons are bundled at build time (no icon API at runtime): use literal `i-lucide-*` names in
  the source so the build finds them.
- Title bar color: `useThemeColor` sets `theme-color` to the page's background (as #rrggbb,
  via a canvas: the palette is oklch) whenever the tone, neutral color or mode changes, and
  remembers it; a head script creates the tag with that color before the first paint.
- Install offer (`useInstallApp`, `InstallAppBanner`, Docs › Install): an inline script in
  the head (`nuxt.config.ts`) keeps Chrome's `beforeinstallprompt`, which can fire before the
  app starts; the plugin `install-prompt.client.ts` takes it over. Safari is detected from the
  user agent (it has no install API); `display-mode: standalone` means installed.
- Updates reach open windows (`utils/app-update.ts`, plugin `app-update.client.ts`): the app
  compares its Nuxt build id with `/_app/builds/latest.json` at start, on `pageshow` from the
  browser's cache, when the window becomes visible and when the event stream reconnects (an
  update restarts the server), and reloads when they differ, once per build (sessionStorage)
  and after open notes are saved (`useNoteDocument` holds it while changes are pending).
- The website (`site/`, tandem.w3lt.org): the same Nuxt app built with `TANDEM_SITE=1`
  (`build:site`, `dev:site` on :3012), where a `pages:extend` hook keeps only the landing page,
  at `/` (the app's build drops it), `runtimeConfig.public.site` skips everything that talks to
  the server (`app.vue`'s loading and events, the update check), and there is no web app
  manifest. Its own build folder and output (`.output-site`), so it builds while the dev server
  runs. `site/Dockerfile` builds it from the repository's root and serves it with Caddy
  (`site/Caddyfile`, :8080); DokWalt deploys it (`site/README.md`). The end-to-end tests serve
  the build as Caddy does (`scripts/serve-site.ts`).
- Landing page (`pages/landing.vue`, `layout: false`, demos in `components/landing/`): CSS
  animations (classes prefixed `landing-`), `v-reveal` (`utils/reveal.ts`) for scroll reveals,
  and `useDemoLoop` for the scripted demos (cancelled on unmount; skipped with reduced motion,
  which shows the final state). Its claims are real: commands and tool names from the CLI and
  MCP server, timings from `bench`.
- File-type icons (attachment chips, Files panel) come from the VS Code icon set:
  `utils/file-icon-map.ts` maps extensions to icons, and `scripts/file-icons.ts` extracts their
  SVG into `utils/file-icons.generated.ts` (committed; regenerate after changing the map with
  `./td pnpm --filter @tandem/web file-icons`). Unknown types get a generic file icon.

## Standalone app (`packages/standalone`)

- `src/main.ts`: `tandem serve --data <folder>` runs `startServer` (`packages/server/src/server.ts`,
  which the Docker entry `main.ts` also uses) on 127.0.0.1; any other command is the CLI.
  `startServer` first waits for its port while another app holds it (`port.ts`): crashing
  would make the login item restart it every 2 s.
- `scripts/build.ts` (via `./td release`): esbuild bundles the entry and its dependencies into
  one ES module, `tandem.mjs` (syntax for Node 22), next to the web app (`web/`), the migrations
  (`drizzle/`), the Chrome extension (`extension/`, built first) and `manifest.json` (version,
  build hash): `dist/tandem/`, which `./td release`
  copies to `app/tandem/` and checks with `scripts/smoke.mjs` on Node 22.16 and the version
  in `app/node.env` (Docker images): start, create a note, search it, load the web app. No Node
  inside (it was ~45 MB per platform): the computer's runs it, or one the installer downloads.
  `nodeSupported` (`runtime.ts`) is the requirement, Node
  22.16+ but not 23 (`setReturnArrays` in node:sqlite); `main.ts` refuses others, and
  `install.sh` checks the same.
- `src/runtime.ts`: the app folder (`~/Library/Application Support/Tandem/`, `~/.local/share/tandem/`,
  or `TANDEM_HOME`) holds the live databases, the settings and the installed app (`app/`). The
  built app finds its files next to `tandem.mjs` (its manifest says it's built); run from the
  repository, it uses the packages' own.
- `src/settings.ts`: `install.env` in the app folder (notes folder, port; shell syntax, as the
  installer sources it). `tandem serve` reads it: by hand, after its arguments and the
  environment; as the login item (`XPC_SERVICE_NAME` is its label), before them, since it holds
  the folder chosen in Settings. One live database per notes folder
  (`databases/<hash of its path>.db`): switching folders never mixes their ids and history; a
  folder's first one is restored from its backup, and the single `tandem.db` of 0.1 becomes
  the current folder's.
- Switching folders (Settings): `api/index.ts` exposes `GET/PUT /notes-folder` and
  `GET/POST /disk-folders` (`folders.ts`: listing and checks); whoever starts the server passes
  a `NotesFolderControl`. The standalone app's saves the choice and exits; launchd restarts it
  (`KeepAlive`, `ThrottleInterval` 2 s) on the new folder. Without one (Docker, development),
  the folder is read-only.
- `app/` (committed): `tandem/` (the built app, rewritten by `./td release`), `install.sh`,
  `get.sh` (a shim) and `node.env` (the Node it may download: version and SHA-256 of the four builds, from
  nodejs.org's `SHASUMS256.txt`, written by `./td node-pin`). The installer picks Node
  (`TANDEM_NODE`, the installed launcher's, the `PATH`'s, then its own in `<app folder>/node/`;
  kept by full path since the login item has no shell `PATH`); with none, it asks on the
  terminal (`/dev/tty`: Enter is yes, Ctrl-D no) or follows `TANDEM_INSTALL_NODE`, then
  downloads with `curl` (which honors `HTTPS_PROXY`; `TANDEM_NODE_MIRROR` replaces nodejs.org),
  checks the SHA-256 and keeps `bin/node` and its `LICENSE` only (about 117 MB on macOS). Then
  it copies the app into the app folder (`app.new`, swapped in
  once the running version stops), writes the `tandem` command (a launcher: that Node, with
  SQLite's experimental warning silenced on 22, running `tandem.mjs`), picks the port (free, or this Tandem's own: `curl` exit 7 means nothing listens; `lsof` names the
  app in the way), writes
  `install.env`, and registers the service, which runs `tandem serve` alone
  (`~/Library/LaunchAgents/app.tandem.plist`, or `~/.config/systemd/user/tandem.service`).
  On macOS, when that login item is registered and its plist unchanged (an update), it stays:
  the files are swapped and `launchctl kickstart -k` restarts the app, since each
  `bootstrap` makes macOS notify a new login item. `TANDEM_SERVICE_LABEL` names another one (a second instance, tests).
- The welcome note (`src/welcome.ts`): `startServer({ welcome: true })` (the standalone app;
  `main.ts` with `TANDEM_WELCOME=true`, as `compose.yaml` sets) calls it after reconciling.
  `.tandem/welcomed` is written first, whatever the folder holds, so the check (no node, nothing
  in the trash) happens once per folder. It uses the vault's own methods (pages, icons, a
  database whose first, empty row is filled, then the note's content naming it), as "tandem".
  A web unit test round-trips its Markdown through the editor.
- The one-line install (README › Install): `curl` of GitHub's archive of `main`, piped into
  `tar` in `/tmp`, then `sh /tmp/tandem-main/app/install.sh`. The installer knows it was run that
  way from its folder (`/tmp/tandem-main/app`): its messages then show the command (via
  `again`), and it removes that folder when done (sh reads the script from an open descriptor,
  so it can). Questions still work in a pipe: the installer reads them from `/dev/tty`. The web
  app shows the command from `utils/install-command.ts`. `app/get.sh`, the command published with
  0.5.1 (fetched from raw.githubusercontent.com), only runs the same steps.

## CLI (`packages/cli`)

`cli.ts` parses arguments (`node:util` `parseArgs`) and calls the API with the typed client
(databases: columns and values by name, through `cellsByName` and `rowsByName`);
`run()` takes its input and output as parameters, so tests run it against an in-memory app.
It is part of the standalone app (the `tandem` command). In Docker it is installed as
`/usr/local/bin/tandem` in the image; `bin/tandem` on the Mac runs it with
`docker compose exec` and streams host files through standard input.

## Chrome extension (`packages/extension`)

Manifest V3, its scripts bundled by esbuild (`scripts/build.ts`, into `dist/`; they use
`@tandem/shared`), its pages plain HTML and CSS (`static/`), its version the app's. It is loaded
unpacked (Developer mode): from the installed app's `extension/` folder, which an update
replaces (Chrome reads it again when it restarts), or from `dist/` in development. Its `key` (a
public key; the private one isn't kept: no packed extension) fixes its id, so its origin, which
the server trusts (`EXTENSION_ORIGIN`). With host permissions on localhost and 127.0.0.1 only,
its requests need no CORS.

- `tandem.ts`: the API client (status, list, lookup by address, search, create, change), its
  errors as `offline` (nothing answers), `off` (`bookmarks_off`) or `error`.
- `popup.ts`: the active tab (`?tab=<id>` when opened as a page: tests), its description read in
  the page (`chrome.scripting`, `page.ts`'s `readDescription`, self-contained), its favicon from
  the tab (a `data:` URL) or Chrome's `_favicon` service; an existing bookmark is edited. Saving
  is a message to the service worker (`SaveMessage`): the popup closes once it's received, as
  its own requests would stop with it.
- `background.ts` (service worker): the ✓ badge on bookmarked pages (looked up when a tab is
  activated or loads, and set at once when the popup saves: a ! if the save fails), the saves, and the address bar's `tb` keyword
  (`chrome.omnibox`: Tandem's search, its `<mark>`s as `<match>`).
- `options.ts`: Tandem's address (`chrome.storage.sync`), checked when saved.
- Tests: units for the client and the page helpers; `packages/web/e2e/extension.spec.ts` loads
  the built extension in Chromium (a persistent context, `channel: 'chromium'`) against the test
  server.
