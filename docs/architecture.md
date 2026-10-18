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
code bundled into one executable (below).

## Packages

| Package               | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `packages/shared`     | Types of the API's data; rules both sides apply (titles, wiki links, authors, French formats) |
| `packages/server`     | Vault, database, search, history, watcher, Hono API, MCP server, entry point                  |
| `packages/cli`        | The `tandem` CLI (a typed client of the API)                                                  |
| `packages/web`        | Nuxt 4 single-page app with Nuxt UI; editor extensions; Playwright tests                      |
| `packages/standalone` | The standalone app: one executable (server + CLI + web app), its build                        |

The web app and the CLI use the server's API through Hono's typed client
(`@tandem/server/client`): route types flow from the server to its clients.

## Data

### Files (source of truth)

- A page is `Title.md`; its child pages are in `Title/`; its attachments in `Title.assets/`.
- A folder without a same-named page is a folder node. When `X.md` appears next to a folder
  `X/`, the page takes the folder over (its contents become child pages).
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
| `nodes.icon`                 | Custom icon of a page or folder: `emoji:<emoji>` or `image:<file>` (in `<data>/.tandem/icons/`, served at `/api/nodes/:id/icon`); the API returns a `NodeIcon`                |
| `notes_fts`, `notes_trigram` | FTS5 indexes (words; trigrams), filled by the vault                                                                                                                           |
| `search_rows`                | The rowid of each page in both FTS5 indexes (FTS5 can't index `node_id`): updates and lookups by page go straight to its rows                                                 |

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
folders and the versions.

## HTTP

- `/api/*` (`api/index.ts`): internal JSON API; validation with zod (errors → 400), vault
  errors → 404/409/400. The author is the `X-Tandem-Author` header (`owner` from the web app,
  `agent` by default).
- `/api/events`: Server-Sent Events (`tree`, `note`, `trash`, `settings`), with a ping every
  25 s.
- `/files/<path>`: files of the data folder (never hidden ones), with ETag, and a CSP that keeps
  SVG scripts from running.
- `/mcp` (`api/mcp.ts`): MCP over Streamable HTTP, stateless (one MCP server per request,
  carrying the request's author).
- `/health`, and the web app's static files with a fallback to `index.html`.

## Web app (`packages/web`)

- Nuxt 4 with `ssr: false`, built with `nuxt generate`, served by the server. In development,
  Nitro's dev proxy forwards `/api`, `/files` and `/mcp` to the dev server.
- Layout: `UDashboardGroup` with a sidebar (search button, `NoteTree`, navigation, color mode),
  the search palette (`NoteSearch`, the only search; `useSearchPalette` opens it with a query),
  and pages made of `UDashboardPanel`s. The note page adds `NoteSidePanel` (outline, links,
  history, files). The editor reports the heading being read (`currentHeading`: measured on
  scroll, from heading positions, not anchors); Nuxt UI's `ContentToc` needs Nuxt Content.
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
  drawn as decorations; typing, Backspace and Delete apply to all of them). The Shortcuts page
  (`pages/shortcuts.vue`) reads `utils/shortcuts.ts`, the list of every shortcut.
- Startup bundle: large, rarely needed code loads on demand. The emoji list (~500 KB) loads
  with the icon picker (`LazyIconPicker`) or after a note opens (the `:` menu), Mermaid when a
  diagram shows. Check what a change adds to the startup files (`index.html`'s scripts) after
  `nuxt generate`.
- Icons are bundled at build time (no icon API at runtime): use literal `i-lucide-*` names in
  the source so the build finds them.
- Title bar color: `useThemeColor` sets `theme-color` to the page's background (as #rrggbb,
  via a canvas: the palette is oklch) whenever the tone, neutral color or mode changes, and
  remembers it; a head script creates the tag with that color before the first paint.
- Install offer (`useInstallApp`, `InstallAppBanner`, Settings › App): an inline script in
  the head (`nuxt.config.ts`) keeps Chrome's `beforeinstallprompt`, which can fire before the
  app starts; the plugin `install-prompt.client.ts` takes it over. Safari is detected from the
  user agent (it has no install API); `display-mode: standalone` means installed.
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
- `scripts/build.ts` (via `./td release`): esbuild bundles the entry and its dependencies into
  one ES module; the web app and the migrations become embedded assets (with a manifest:
  version, build hash, files); `node --build-sea` turns Node's official binary for each target
  (downloaded once into `.cache/`, checked against nodejs.org's SHA-256 sums) into
  `dist/tandem-<os>-<arch>`. Everything runtime is JavaScript plus `node:sqlite`: no native
  module, which is what makes cross-building from the Linux toolchain possible. `./td release`
  then signs the macOS executables ad hoc (`codesign`, on the Mac), writes `SHA256SUMS` and
  runs the Linux one as a smoke test.
- `src/runtime.ts`: the app folder (`~/Library/Application Support/Tandem/`, `~/.local/share/tandem/`,
  or `TANDEM_HOME`) holds the live databases and the embedded files, extracted once per build
  into `runtime/<build>/` (atomically, older builds removed).
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
- `install.sh` (repo root): downloads the latest release for the platform, checks it, writes
  `install.env`, and registers the service, which runs `tandem serve` alone
  (`~/Library/LaunchAgents/app.tandem.plist`, or `~/.config/systemd/user/tandem.service`).
  `TANDEM_SERVICE_LABEL` names another one (a second instance, tests).

## CLI (`packages/cli`)

`cli.ts` parses arguments (`node:util` `parseArgs`) and calls the API with the typed client;
`run()` takes its input and output as parameters, so tests run it against an in-memory app.
It is part of the standalone executable (`tandem`). In Docker it is installed as
`/usr/local/bin/tandem` in the image; `bin/tandem` on the Mac runs it with
`docker compose exec` and streams host files through standard input.
