// Every block and inline element the editor writes, for the Docs › Blocks tour: each one is
// shown in the editor (read-only) next to its Markdown. Keep it in sync with the editor's
// extensions and with docs/agents.md › Markdown that Tandem understands.

export interface DocsBlock {
  id: string
  title: string
  icon: string
  description: string
  /** How to add it: the `/` menu's item, typed Markdown, keys (UKbd values). */
  slash?: string
  typed?: string
  keys?: string[][]
  /** The Markdown, as saved in the note. */
  markdown: string
  /** What the editor shows, when it differs from `markdown` (attachments the docs don't have),
   * or null when it can't be shown here (a database or a bookmark lives in Tandem, not in the
   * Markdown): a drawing of it. */
  preview?: string | null
}

export interface DocsBlockGroup {
  id: string
  title: string
  blocks: DocsBlock[]
}

export const DOCS_BLOCK_GROUPS: DocsBlockGroup[] = [
  {
    id: 'text',
    title: 'Text',
    blocks: [
      {
        id: 'headings',
        title: 'Headings',
        icon: 'i-lucide-heading',
        description:
          'Four levels. They make the Headings panel, and `[[Note#Heading]]` links to one.',
        slash: 'Heading 1',
        typed: '# ',
        markdown: '# Roadmap\n\n## This quarter\n\n### Beta\n\n#### Invitations',
      },
      {
        id: 'formatting',
        title: 'Formatting',
        icon: 'i-lucide-bold',
        description: 'On the selection (the floating toolbar or the keys), or typed as Markdown.',
        typed: '**bold**',
        keys: [['meta', 'b']],
        markdown: 'Text in **bold**, *italic*, ~~struck through~~ and `inline code`.',
      },
      {
        id: 'links',
        title: 'Links',
        icon: 'i-lucide-link',
        description:
          'A pasted address becomes a link. ⌘-click opens one; a plain click puts the cursor in it, to edit it.',
        markdown: 'Read [the release notes](https://example.com/releases) before the demo.',
      },
      {
        id: 'wiki-links',
        title: 'Links to notes',
        icon: 'i-lucide-file-symlink',
        description:
          'By title, or by path when titles are ambiguous, to a heading, with a label. They follow renames and moves, and the linked note lists them in its Links panel. A link to a note that does not exist yet looks muted: clicking it offers to create the note.',
        slash: 'Link to a note',
        typed: '[[',
        markdown: 'See [[Roadmap]], [[Projects/Beta|the beta]] and [[Roadmap#This quarter]].',
      },
      {
        id: 'emoji',
        title: 'Emoji',
        icon: 'i-lucide-smile',
        description: 'Type a colon and a name, then pick one. Saved as the emoji itself.',
        typed: ':smile',
        markdown: 'Shipped 🎉 on time 🙂',
      },
      {
        id: 'todo',
        title: 'TODO',
        icon: 'i-lucide-list-todo',
        description:
          '`TODO:` in capitals starts a TODO: it and the rest of its line are highlighted, and listed on the TODOs page with their note, when TODOs are on (Settings › Features). None in code.',
        typed: 'TODO: ',
        markdown: 'TODO: ask Léa for the pricing page.',
      },
    ],
  },
  {
    id: 'lists',
    title: 'Lists',
    blocks: [
      {
        id: 'bullet-list',
        title: 'Bullet list',
        icon: 'i-lucide-list',
        description: 'Tab and Shift+Tab move an item one level in or out.',
        slash: 'Bullet list',
        typed: '- ',
        keys: [['meta', 'shift', '8']],
        markdown: '- Design\n- Engineering\n  - Web app\n  - Server',
      },
      {
        id: 'numbered-list',
        title: 'Numbered list',
        icon: 'i-lucide-list-ordered',
        description: 'Renumbered as items move.',
        slash: 'Numbered list',
        typed: '1. ',
        keys: [['meta', 'shift', '7']],
        markdown: '1. Write the plan\n2. Review it\n3. Ship it',
      },
      {
        id: 'to-do-list',
        title: 'To-do list',
        icon: 'i-lucide-list-checks',
        description: 'A done item is struck through, not its sub-items.',
        slash: 'To-do list',
        typed: '[ ] ',
        keys: [['meta', 'shift', '9']],
        markdown: '- [x] Onboarding flow\n- [ ] Announcement post\n- [ ] Pricing page',
      },
      {
        id: 'mixed-lists',
        title: 'Mixed lists',
        icon: 'i-lucide-list-tree',
        description:
          'Each level of a list has one kind, and any level any kind: to-dos under a bullet, bullets under a step. A marker typed at the start of an item changes its level’s kind.',
        markdown:
          '1. Prepare the beta\n   - [x] Pick ten teams\n   - [ ] Send the invitations\n2. Launch\n   - Blog post\n   - Newsletter',
      },
    ],
  },
  {
    id: 'blocks',
    title: 'Blocks',
    blocks: [
      {
        id: 'quote',
        title: 'Quote',
        icon: 'i-lucide-text-quote',
        description: 'Quoted text.',
        slash: 'Quote',
        typed: '> ',
        keys: [['meta', 'shift', 'b']],
        markdown: '> Make it work, make it right, make it fast.',
      },
      {
        id: 'callouts',
        title: 'Callouts',
        icon: 'i-lucide-info',
        description:
          'GitHub’s five kinds: note, tip, important, warning and caution. The icon’s menu changes the kind.',
        slash: 'Callout: note',
        markdown:
          '> [!NOTE]\n> The beta starts on 3/11.\n\n> [!TIP]\n> Keep the beta small: ten teams.\n\n> [!IMPORTANT]\n> Every team needs an admin.\n\n> [!WARNING]\n> The import is slow on large vaults.\n\n> [!CAUTION]\n> Deleting a team deletes its notes.',
      },
      {
        id: 'details',
        title: 'Collapsible section',
        icon: 'i-lucide-list-collapse',
        description: 'A title that opens and closes, with any blocks inside.',
        slash: 'Collapsible section',
        markdown:
          '<details>\n<summary>Meeting notes</summary>\n\n- Beta in November\n- Pricing in December\n\n</details>',
      },
      {
        id: 'code-block',
        title: 'Code block',
        icon: 'i-lucide-square-code',
        description:
          'Highlighted in its language (the menu at its top right), with a copy button. Its theme is in Settings › Editor.',
        slash: 'Code block',
        typed: '``` ',
        keys: [['meta', 'alt', 'c']],
        markdown:
          '```ts\nexport function greet(name: string) {\n  return `Hello, ${name}!`\n}\n```',
      },
      {
        id: 'mermaid',
        title: 'Diagram',
        icon: 'i-lucide-workflow',
        description:
          'A Mermaid code block, drawn as a diagram: flowcharts, sequences, timelines… Its edit button shows the code above it.',
        slash: 'Diagram (Mermaid)',
        markdown: '```mermaid\nflowchart LR\n  Idea --> Draft --> Review --> Published\n```',
      },
      {
        id: 'table',
        title: 'Table',
        icon: 'i-lucide-table',
        description:
          'A GitHub table, in the note: text in its cells (no merged cells, no lists). Its toolbar adds and removes rows and columns.',
        slash: 'Table',
        markdown:
          '| Team   | Seats | Plan |\n| ------ | ----- | ---- |\n| Design | 4     | Pro  |\n| Sales  | 12    | Team |',
      },
      {
        id: 'database',
        title: 'Database',
        icon: 'i-lucide-sheet',
        description:
          'Rows with typed columns (text, number, date, checkbox, choice), sorted and filtered, edited in place (Shift+Enter for a new line in a text cell, ⌘Enter for a row below, ⌥↑ / ⌥↓ to move a row), columns resized from their edge. Its data is in Tandem: the note only has a block naming it. Agents read and change it with their tools.',
        slash: 'Database',
        markdown: '```database\nid: 01JB7Q2V9X3K8M4N5P6R7S8T9V\n```',
        preview: null,
      },
      {
        id: 'bookmark',
        title: 'Bookmark',
        icon: 'i-lucide-bookmark',
        description:
          'A website’s card (its favicon, name, site and description), from your bookmarks (Settings › Features). A click selects it and opens its menu (the website, the bookmark, another one, removing it), a double click opens the website; ⌫ deletes it, as any block. Changing the bookmark changes every card. Its data is in Tandem: the note only has a block naming it.',
        slash: 'Bookmark',
        markdown: '```bookmark\nid: Kx3fq9P2mZ0a\n```',
        preview: null,
      },
      {
        id: 'divider',
        title: 'Divider',
        icon: 'i-lucide-separator-horizontal',
        description: 'A horizontal line between parts of a note.',
        slash: 'Divider',
        typed: '---',
        markdown: 'Before\n\n---\n\nAfter',
      },
    ],
  },
  {
    id: 'files',
    title: 'Files',
    blocks: [
      {
        id: 'image',
        title: 'Image',
        icon: 'i-lucide-image',
        description:
          'Dropped or pasted anywhere in a note: copied into the note’s `.assets` folder. Its corner resizes it.',
        slash: 'Image or file',
        markdown: '<img src="Roadmap.assets/logo.png" alt="Logo" width="96">',
        preview: '<img src="/icon-512.png" alt="Logo" width="96">',
      },
      {
        id: 'file',
        title: 'File',
        icon: 'i-lucide-paperclip',
        description:
          'Any other file, shown as a chip with its type’s icon: a click opens it. The Files panel lists them all.',
        slash: 'Image or file',
        markdown:
          '[report.pdf](Roadmap.assets/report.pdf) and [budget.xlsx](Roadmap.assets/budget.xlsx)',
      },
    ],
  },
]
