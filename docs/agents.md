# Tandem for agents

How an agent reads and writes the owner's notes. Paste the relevant parts into an agent's
instructions (or point it here).

## Connecting

**MCP** (preferred), over HTTP while Tandem runs:

```bash
claude mcp add --transport http tandem http://localhost:3000/mcp --header "X-Tandem-Author: claude"
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
- Never delete notes unless the owner asked; deleted notes go to the trash.
- Dates in notes are French-formatted (`17/10/2026`), the interface is in English.

## Markdown that Tandem understands

GitHub-flavored Markdown, plus:

| Feature             | Write                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Link to a note      | `[[Title]]`, `[[Folder/Title]]`, `[[Title#Heading]]`, `[[Title\|label]]`                |
| Callout             | `> [!NOTE]` (or `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) then `> text` lines           |
| Collapsible section | `<details>`, `<summary>Title</summary>`, blank line, Markdown, blank line, `</details>` |
| Task                | `- [ ] to do`, `- [x] done`                                                             |
| Diagram             | a ` ```mermaid ` code block                                                             |
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
