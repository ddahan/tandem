# Myfluence for agents

How an agent reads and writes the owner's notes. Paste the relevant parts into an agent's
instructions (or point it here).

## Connecting

**MCP** (preferred), over HTTP while Myfluence runs:

```bash
claude mcp add --transport http myfluence http://localhost:3000/mcp --header "X-Myfluence-Author: claude"
```

**CLI**, from the Mac (`bin/myfluence`, see the README), with your name for authorship:

```bash
export MYFLUENCE_AUTHOR=claude
myfluence search "deployment checklist"
myfluence read "Projects/Roadmap" --meta
myfluence append "Projects/Roadmap" "- [ ] Draft the release notes"
myfluence replace "Projects/Roadmap" --find "- [ ] Draft" --with "- [x] Draft"
myfluence new "Weekly meeting" --parent Meetings --tags meetings < notes.md
myfluence attach "Projects/Roadmap" ./diagram.png --insert
myfluence --help
```

**Files**: notes are plain Markdown in the data folder; editing them directly works (the app
picks changes up live) but is credited to "External edit" and can't be undone from the app as
precisely. Prefer MCP or the CLI.

## Rules

- Name yourself (`X-Myfluence-Author` header or `MYFLUENCE_AUTHOR`): every line keeps the
  author who last changed it, and the history shows who wrote each version.
- Prefer small edits (`append_to_note`, `replace_in_note`) to rewriting a note: rewriting
  re-attributes every changed line to you.
- Reference notes by id, path (`Projects/Roadmap`, without `.md`) or title.
- Never delete notes unless the owner asked; deleted notes go to the trash.
- Dates in notes are French-formatted (`17/10/2026`), the interface is in English.

## Markdown that Myfluence understands

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
  to the note, URL-encoded (`My%20note.assets/a%20b.png`). `attach_file` / `myfluence attach`
  store the file and return the Markdown to use.
- Tables are GFM tables: no merged cells, only inline content in cells.
- No front matter: tags are set with `set_tags` / `myfluence tags <note> <tag…>`, icons with
  `set_icon` / `myfluence icon <note> <emoji>`.
