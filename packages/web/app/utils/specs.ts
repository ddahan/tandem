// Settings › Specs: every feature of the app in a few words, grouped, and what doesn't exist
// yet, so the owner can see at a glance what Tandem does. Functional, not technical: the full
// behavior is in docs/SPEC.md, whose "Out of scope" section the "not yet" items follow. A
// feature added, changed or ruled out goes here too.

export interface SpecFeature {
  title: string
  description: string
  /** Doesn't exist yet (planned or out of scope for now). */
  later?: boolean
  /** A switch in Settings › Features. */
  optional?: boolean
}

export interface SpecGroup {
  id: string
  icon: string
  title: string
  features: SpecFeature[]
}

export const SPEC_GROUPS: SpecGroup[] = [
  {
    id: 'pages',
    icon: 'i-lucide-folder-tree',
    title: 'Pages and organization',
    features: [
      {
        title: 'Pages inside pages',
        description:
          'Everything is a page, and any page can hold pages: the sidebar’s tree, with new page, new page inside, rename and delete in each row’s menu.',
      },
      {
        title: 'Folders',
        description:
          'A page with pages inside but no text shows as a folder; writing in it makes it a page again.',
      },
      {
        title: 'Drag and drop',
        description: 'Reorder and move pages in the tree, one or several at once.',
      },
      {
        title: 'Several pages at once',
        description:
          '⌘-click and ⇧-click select rows of the tree, to move, delete or open them together.',
      },
      {
        title: 'Tree from the keyboard',
        description: 'Arrows to move and preview, ↵ to open, F2 to rename, ⌥↑/⌥↓ to reorder.',
      },
      {
        title: 'Breadcrumb',
        description: 'Above a note’s title, the pages it is in, each a link.',
      },
      {
        title: 'Icons',
        description: 'An emoji or an image of yours for every page, shown everywhere it appears.',
      },
      {
        title: 'Tags',
        description: 'Tag pages, and find them by tag from Home or the search.',
        optional: true,
      },
      {
        title: 'Home',
        description: 'A start page with the search, tags and the recently updated pages.',
      },
      { title: 'Favorites', description: 'Pinning pages to find them quickly.', later: true },
      { title: 'Templates', description: 'Starting a page from a model.', later: true },
    ],
  },
  {
    id: 'tabs',
    icon: 'i-lucide-panels-top-left',
    title: 'Tabs and windows',
    features: [
      {
        title: 'Tabs',
        description:
          'Pages open in tabs as in VS Code, on up to two rows, the rest in a “+N” menu; dragged to reorder, kept when Tandem reopens.',
      },
      {
        title: 'Preview tab',
        description:
          'A click in the tree previews a page in an italic tab that the next preview replaces; a double click or an edit keeps it.',
      },
      {
        title: 'Tab shortcuts',
        description:
          'Close, reopen closed tabs (⌘⇧T), go to the next or previous one, or to a numbered one (⌃1…⌃9).',
      },
      {
        title: 'A note in its own window',
        description: 'Open a note alone in a window, to put two notes side by side.',
      },
    ],
  },
  {
    id: 'write',
    icon: 'i-lucide-pen-line',
    title: 'Writing',
    features: [
      {
        title: 'Rich editor',
        description:
          'Formatting shown as you type: headings, bold, italic, lists, to-dos, quotes, code, callouts, collapsible sections, emojis, tables.',
      },
      {
        title: 'Slash menu and toolbar',
        description: '/ inserts any block; a floating toolbar formats the selection.',
      },
      {
        title: 'Markdown view',
        description: 'The note’s Markdown itself, numbered lines, editable (⌘⇧E).',
      },
      {
        title: 'Nothing lost',
        description:
          'Markdown the editor can’t show (HTML comments, raw HTML) opens read-only instead of being lost silently.',
      },
      { title: 'Autosave', description: 'Saved as you type; nothing to click.' },
      {
        title: 'Lists',
        description:
          'Bullets, numbers and to-dos mixed at any level; Tab and Shift+Tab move items a level at a time.',
      },
      {
        title: 'Moving blocks',
        description: 'Drag any block or list item by its handle (⋮⋮), or move it with ⌥↑/⌥↓.',
      },
      {
        title: 'Code blocks',
        description: 'Syntax highlighting in a theme of your choice, and a copy button.',
      },
      {
        title: 'Diagrams',
        description: 'Mermaid diagrams, drawn in the note, their code shown when editing them.',
      },
      {
        title: 'VS Code shortcuts',
        description:
          'Duplicate and delete lines, insert a line above or below, select every occurrence of a word and type in all at once.',
      },
      {
        title: 'Find and replace',
        description: 'In the note (⌘F, ⌘⌥F), with match case, replace and replace all.',
      },
      {
        title: 'Undo and redo',
        description:
          'One history for the whole app: text, databases, pages, bookmarks, in the order things were done.',
      },
      {
        title: 'Spell check',
        description: 'Misspelled words underlined while typing (the browser’s checker).',
        optional: true,
      },
      {
        title: 'Conflicts',
        description:
          'A note changed elsewhere while open reloads live, or offers to keep yours, take theirs or compare.',
      },
    ],
  },
  {
    id: 'links',
    icon: 'i-lucide-link',
    title: 'Links and files',
    features: [
      {
        title: 'Links between notes',
        description:
          '[[Note title]] with autocomplete, updated when a note is renamed or moved; a link to a missing note offers to create it.',
      },
      { title: 'Backlinks', description: 'The notes linking to this one, in the side panel.' },
      {
        title: 'Files',
        description:
          'Drop or paste any file in a note: images show inline (resizable, full screen on double click), other files as chips.',
      },
      {
        title: 'Files panel',
        description: 'A note’s attachments with their size, to open, add or delete.',
      },
      {
        title: 'Cleaning up files',
        description: 'Removing a file’s last link asks whether to delete the file too.',
      },
    ],
  },
  {
    id: 'databases',
    icon: 'i-lucide-table-2',
    title: 'Databases',
    features: [
      {
        title: 'Databases in notes',
        description:
          '/database inserts a table with typed columns: text, number, money (€), date, checkbox, choice, multiple choices.',
      },
      {
        title: 'Spreadsheet editing',
        description:
          'Cells edited in place, arrows between cells, rows added, moved and deleted from the keyboard.',
      },
      {
        title: 'Columns',
        description:
          'Rename, change type (values converted), resize, move, delete; colored choices, required or not.',
      },
      {
        title: 'Sort and filters',
        description: 'Saved with the database, so everyone (agents too) sees the same view.',
      },
      {
        title: 'Databases panel',
        description: 'The databases a note shows, with their row counts.',
      },
      {
        title: 'Relations and formulas',
        description: 'Columns linking databases, or computed from others.',
        later: true,
      },
      {
        title: 'Other views',
        description: 'Board or calendar views of a database.',
        later: true,
      },
      {
        title: 'Database history',
        description: 'Earlier versions of a database, as notes have.',
        later: true,
      },
      {
        title: 'Table to database',
        description: 'Turning a Markdown table into a database.',
        later: true,
      },
    ],
  },
  {
    id: 'search',
    icon: 'i-lucide-search',
    title: 'Search',
    features: [
      {
        title: 'One search',
        description:
          'Titles, text, attachment names, bookmarks and the app’s actions, in one palette (⌘⇧F).',
      },
      {
        title: 'Forgiving',
        description:
          'Finds words as they are typed, ignores accents, corrects typos; recent notes ranked higher.',
      },
      {
        title: 'Filters',
        description: 'Quoted phrases, -word to exclude, tag: and in: to narrow.',
      },
      {
        title: 'Search inside attachments',
        description: 'The text of PDFs and other attached files.',
        later: true,
      },
    ],
  },
  {
    id: 'daily',
    icon: 'i-lucide-calendar-days',
    title: 'Daily notes and agenda',
    features: [
      {
        title: 'A note per day',
        description:
          'Opened from Today in the sidebar (⌘T in the installed app); days browsed with ‹ › and the arrows.',
        optional: true,
      },
      {
        title: 'Calendar',
        description:
          'A month in the side panel, showing which days have notes, to-dos left or done, and events.',
      },
      {
        title: 'Agenda',
        description:
          'Events at the top of a day’s note, typed in one line (14h Standup), checked off when done.',
      },
      {
        title: 'Repeating events',
        description: 'Every day, weekday, week, 2 weeks, month or year, until a day or for ever.',
      },
      {
        title: 'Calendar feeds',
        description: 'Google or iCloud calendars (.ics) shown read-only in the agenda.',
      },
      { title: 'Weekly notes', description: 'A note per week.', later: true },
      {
        title: 'Calendar sync',
        description: 'Writing events to Apple or Google calendars.',
        later: true,
      },
      {
        title: 'Reminders and invitations',
        description: 'Alerts before an event, inviting people.',
        later: true,
      },
    ],
  },
  {
    id: 'todos',
    icon: 'i-lucide-list-todo',
    title: 'TODOs',
    features: [
      {
        title: 'TODO lines',
        description: 'TODO: highlights the rest of its line in any note.',
        optional: true,
      },
      {
        title: 'TODOs page',
        description: 'Every TODO by page, with its count in the sidebar; a click goes to it.',
      },
    ],
  },
  {
    id: 'bookmarks',
    icon: 'i-lucide-bookmark',
    title: 'Bookmarks',
    features: [
      {
        title: 'Bookmarks in notes',
        description:
          'Websites shown as cards in notes (/bookmark): the notes organize them, no folders of their own.',
        optional: true,
      },
      {
        title: 'Unsorted',
        description:
          'In the sidebar, the bookmarks still to sort, dragged into notes or onto pages.',
      },
      {
        title: 'Bookmark pages',
        description: 'Each bookmark’s name, address, description and icon, edited in place.',
      },
      {
        title: 'Bookmarks panel',
        description: 'The note’s bookmark cards and its links to websites.',
      },
      {
        title: 'Chrome extension',
        description:
          'Save the page you’re on in one click (⌥⇧D); search bookmarks from the address bar (tb).',
      },
      {
        title: 'Import and export',
        description: 'Import Chrome’s bookmarks; export them in the format every browser reads.',
      },
      { title: 'Safari', description: 'An extension for Safari.', later: true },
    ],
  },
  {
    id: 'track',
    icon: 'i-lucide-history',
    title: 'History and authorship',
    features: [
      {
        title: 'History',
        description:
          'Versions of each note by day, compared with the current one, restored in a click.',
      },
      {
        title: 'Authorship',
        description:
          'Every line remembers who wrote it, you or an agent, shown in the author’s color.',
      },
      {
        title: 'Trash',
        description: 'Deleted pages wait with their pages, files and history, to restore.',
        optional: true,
      },
    ],
  },
  {
    id: 'agents',
    icon: 'i-lucide-bot',
    title: 'Agents',
    features: [
      {
        title: 'MCP server',
        description:
          'Claude and any MCP client read, write, search and organize notes, databases, bookmarks and the agenda.',
      },
      { title: 'CLI', description: 'The same operations from a terminal (tandem).' },
      {
        title: 'Files on disk',
        description: 'Agents can also edit the Markdown files directly; Tandem picks it up.',
      },
    ],
  },
  {
    id: 'app',
    icon: 'i-lucide-app-window',
    title: 'The app',
    features: [
      {
        title: 'Plain Markdown files',
        description:
          'Notes are files in a folder of yours (OneDrive, iCloud…), readable by any app.',
      },
      {
        title: 'Notes folder',
        description: 'Picked and changed from Settings › General.',
      },
      {
        title: 'One-command install',
        description: 'No admin rights, starts at login, updated with the same command.',
      },
      {
        title: 'Installed app',
        description: 'Its own window and Dock icon, from Chrome, Edge or Safari.',
      },
      {
        title: 'Side panel',
        description:
          'Headings, links, bookmarks, files and databases of the note, and of its sub-pages.',
      },
      {
        title: 'Appearance',
        description:
          'Light or dark, background tone, colors, corners, fonts, text size, page width, code theme.',
      },
      {
        title: 'Optional features',
        description: 'Turn off what you don’t use (Settings › Features); its data is kept.',
      },
      { title: 'Docs', description: 'Install, concepts, security, blocks, agents, shortcuts.' },
      {
        title: 'Export',
        description: 'Notes as PDF or HTML.',
        later: true,
      },
      {
        title: 'Several computers',
        description: 'One notes folder used by Tandem on several computers at once.',
        later: true,
      },
      {
        title: 'Sign-in',
        description: 'Tandem is local to this computer, with no accounts.',
        later: true,
      },
    ],
  },
]
