# Tandem for agents

How an agent reads and writes the owner's notes. Paste the relevant parts into an agent's
instructions (or point it here).

## Connecting

**MCP** (preferred), over HTTP while Tandem runs:

```bash
claude mcp add --transport http tandem http://localhost:3864/mcp --header "X-Tandem-Author: claude"
```

**CLI** (`tandem`, installed with the app; with Docker, `bin/tandem`: see the README), with
your name for authorship:

```bash
export TANDEM_AUTHOR=claude
tandem search "deployment checklist"
tandem read "Projects/Roadmap" --meta
tandem append "Projects/Roadmap" "- [ ] Draft the release notes"
tandem replace "Projects/Roadmap" --find "- [ ] Draft" --with "- [x] Draft"
tandem new "Weekly meeting" --parent Meetings --tags meetings < notes.md
tandem attach "Projects/Roadmap" ./diagram.png --insert
tandem --help
```

**Files**: notes are plain Markdown in the data folder; editing them directly works (the app
picks changes up live) but is credited to "External edit" and can't be undone from the app as
precisely. Prefer MCP or the CLI.

## Rules

- Name yourself (`X-Tandem-Author` header or `TANDEM_AUTHOR`): every line keeps the
  author who last changed it, and the history shows who wrote each version.
- Prefer small edits (`append_to_note`, `replace_in_note`) to rewriting a note: rewriting
  re-attributes every changed line to you. Moving lines unchanged (reordering) keeps their
  authors.
- Reference notes by id, path (`Projects/Roadmap`, without `.md`) or title.
- Everything is a page: there are no folders to create. A page without content but with child
  pages shows as a folder (and is a plain folder on disk); writing in it makes it a page, and
  erasing all of a page that has child pages makes it a folder again.
- Never delete notes unless the owner asked; deleted notes go to the trash.
- Dates in notes are French-formatted (`17/10/2026`), the interface is in English.

## Daily notes

Each day can have a note, `Calendar/2026-10-21.md` (ISO date, the owner's computer's time
zone). `daily_note` (MCP: `date` optional, today by default; `append` adds Markdown at its end)
and `tandem daily [content] [--date 2026-10-21]` read it, creating it when the day has none, so
two callers never make two. It is a note like any other otherwise: read and edit it by its path,
`Calendar/2026-10-21`. The owner may hide daily notes from the app (Settings › Features); they
are still there for agents.

## Agenda

Days have events, kept in Tandem (not in the Markdown). In the day's note, an event the owner
typed is a block naming it (` ```event ` with `id: …`) where it was typed; the others show in
an ` ```agenda ` block holding nothing, which the app adds (don't write in it). To place an
event in its day's note, append its block (`id:` its id); removing the block only takes it out
of the note.
Events have a title, a day, a start and an end (`HH:MM`, 24 h; no start: all day), and may
repeat (`daily`, `weekdays`, `weekly`, `biweekly`, `monthly`, `yearly`, until a day). Events from
the owner's calendar feeds are read-only.

- MCP: `agenda` (`date`, today by default, or `date` to `to`: each event with its id),
  `add_event` (`title`, `date`, `start`, `end`, `repeat`, `until`), `update_event` (`id`, the
  fields to change, `date` to move it; a repeating one: with `on`, only that day, taken out as an
  event of its own; without, all its days from today on, past days unchanged), `delete_event`
  (`id`; `on` for one day of a repeating one; only when asked). `daily_note` lists the day's
  events.
- CLI: `tandem agenda [date] [--to date]`, `tandem event-add "14:00 Standup" [--date …]
  [--repeat weekly] [--until …]` (a time or two first, `13:30-14:30`, or a title alone for all
  day), `tandem event-set <id> ["15:00 New title"] [--title …] [--time 9:00-10:00|day]
  [--day …] [--repeat …|none] [--until …|none] [--date <day>: that day only]`,
  `tandem event-delete <id> [--date <day>]`. `tandem daily` and `tandem read --meta` on a day's
  note list its events.

## Markdown that Tandem understands

GitHub-flavored Markdown, plus:

| Feature             | Write                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Link to a note      | `[[Title]]`, `[[Folder/Title]]`, `[[Title#Heading]]`, `[[Title\|label]]`                |
| Callout             | `> [!NOTE]` (or `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) then `> text` lines           |
| Collapsible section | `<details>`, `<summary>Title</summary>`, blank line, Markdown, blank line, `</details>` |
| Task                | `- [ ] to do`, `- [x] done`                                                             |
| TODO                | `TODO: what to do` (capitals; highlighted, and listed on the owner's TODOs page)        |
| Diagram             | a ` ```mermaid ` code block                                                             |
| Database            | a ` ```database ` block with `id: …` (from `create_database`; see Databases)            |
| Bookmark card       | a ` ```bookmark ` block with `id: …` (from `add_bookmark`; see Bookmarks)               |
| Event               | a ` ```event ` block with `id: …`, in a daily note (an event placed; see Agenda)        |
| Agenda              | an empty ` ```agenda ` block, in a daily note (the day's other events; see Agenda)      |
| Image with a width  | `<img src="Note.assets/a.png" alt="…" width="320">`                                     |
| Attachment          | `[report.pdf](Note.assets/report.pdf)` (shown as a file chip)                           |

- Attachments live in `<Note title>.assets/` next to the note; link them with paths relative
  to the note, URL-encoded (`My%20note.assets/a%20b.png`). `attach_file` / `tandem attach`
  store the file and return the Markdown to use.
- Tables are GFM tables: no merged cells, only inline content in cells.
- No HTML comments and no other raw HTML (only `<img>`, `<br>` and `<details>`): the editor
  can't show them, so such a note opens read-only in the app, until the owner removes them or
  accepts losing them.
- No front matter: tags are set with `set_tags` / `tandem tags <note> <tag…>`, icons with
  `set_icon` / `tandem icon <note> <emoji>`.

## Databases

Tables of rows with typed columns (`text`, `number`, `money`, `date`, `checkbox`, `select`,
`multiselect`), which the
owner sorts and filters. Their data is in Tandem, not in the Markdown: a note shows one with a
` ```database ` block holding only its id. Read and change them with the tools, never by
writing the block's content.

- MCP: `list_databases` (a note's, with their columns, and the colors the owner gave choices), `read_database` (rows with their ids,
  values by column name, as the owner's saved view shows them; `all: true` for every row),
  `create_database` (in a note, its block added at the end; columns and first rows),
  `add_database_rows`, `update_database_row`, `delete_database_row` (only when asked).
- CLI: `tandem databases <note>`, `tandem database <id> [--all]`,
  `tandem database-new <note> <title> Name:text Pages:number "Status:select=To read|Done"`
  (`select!=…`: a value required; `multiselect=…` for several choices per row),
  `tandem row-add <id> Name=Dune Pages=412`, `tandem row-set <id> <row> Status=Done`
  (`Column=` empties a value), `tandem row-delete <id> <row>`.
- Values by column name (any case). Text can hold line breaks (`\n`). Dates `2026-10-17` (or `17/10/2026`), numbers `12.5` or
  `12,5`, amounts in euros like numbers (`12,50 €` too; kept to the cent, read as numbers), checkboxes `true`/`false` (or yes/no), choices by name; several choices (`multiselect`) as a
  list of names (or names separated by commas: `Tags=Design,Urgent` in the CLI), read as a list in the
  column's order. A value that doesn't fit its
  column is refused with the reason. A choice column with `allowEmpty: false` always has a
  value: rows added without one get its first choice, and it can't be set to null.

## Bookmarks

Links to websites, in folders, which the owner keeps in Tandem instead of their browser (saved
from Chrome with Tandem's extension, or in the app). Like databases, their data is in Tandem: a
note shows one as a card with a ` ```bookmark ` block holding only its id. `read_note` (and
`tandem read --meta`) name the bookmarks a note shows, with their titles and addresses.

- MCP: `list_bookmarks` (the tree, with ids and addresses), `search_bookmarks` (title, address
  and description: prefixes, `"phrases"`, `-word`, `in:Folder`, typos corrected),
  `add_bookmark` (`url`; `title` and `description` read from the page when not given; `folder`
  by id or path, `Work/Tools`, made if missing; `note` to add its card at that note's end),
  `update_bookmark` (title, address, description, or `folder` to move it; `""` is the top),
  `delete_bookmark` (a bookmark, or a folder with everything in it; only when asked: it removes
  their cards from the notes showing them, and there is no trash for bookmarks).
- CLI: `tandem bookmarks [query]`, `tandem bookmark-add <url> [--title …] [--description …]
  [--folder Work/Tools] [--note <note>]`, `tandem bookmark-set <id> [new address] [--title …]
  [--description …] [--folder …]`, `tandem bookmark-delete <id>`.
- One bookmark per page: an address already bookmarked (give or take `www.`, `http`/`https`, a
  `#fragment` or a final `/`) is refused, naming its bookmark. Only web addresses (http,
  https).
- The owner may turn bookmarks off in the app (Settings › Features): they are still there for
  agents.
