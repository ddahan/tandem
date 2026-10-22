// Every keyboard shortcut and typing rule of the app, for the Shortcuts page. Keep it in sync
// with the code that defines them (editor extensions, defineShortcuts calls): this list is the
// reference users read. Keys are UKbd values (`meta` is ⌘ on macOS, Ctrl elsewhere).

export interface Shortcut {
  /** Alternatives, each a key combination: [['meta', 'z']] or [['tab'], ['shift', 'tab']]. */
  keys?: string[][]
  /** Or text to type (Markdown rules). */
  typed?: string
  label: string
  description?: string
}

export interface ShortcutGroup {
  id: string
  title: string
  description: string
  icon: string
  shortcuts: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'app',
    title: 'App',
    description: 'Anywhere in Tandem.',
    icon: 'i-lucide-app-window',
    shortcuts: [
      {
        keys: [['meta', 'shift', 'f']],
        label: 'Search in all notes',
        description:
          'Notes, text and attachment names, and actions; starts from the selected text, if any.',
      },
      {
        keys: [
          ['meta', 'n'],
          ['meta', 'alt', 'n'],
        ],
        label: 'New page',
        description:
          'Next to the open page (the same parent, right after it), or at the top. ⌘N in the installed app (in a browser tab, it’s the browser’s).',
      },
      {
        keys: [['meta', 't']],
        label: 'Today’s note',
        description:
          'With daily notes on (Settings › Features); a new page otherwise. In the installed app (in a browser tab, it’s the browser’s).',
      },
      {
        keys: [
          ['meta', 'b'],
          ['meta', 'alt', 'b'],
        ],
        label: 'Show or hide the sidebar',
        description: '⌘B when you aren’t typing (in a note, it’s Bold); ⌥⌘B anywhere.',
      },
      { keys: [['meta', '/']], label: 'Keyboard shortcuts', description: 'This page.' },
      {
        keys: [['meta', '\\']],
        label: 'Show or hide the side panel',
        description: 'In a note: headings, links, history, files, databases.',
      },
      {
        keys: [['meta', 'shift', 'e']],
        label: 'Markdown source',
        description: 'In a note: switch between the editor and the raw Markdown.',
      },
      {
        keys: [['meta', 's']],
        label: 'Save now',
        description: 'Notes save by themselves; this saves without waiting.',
      },
      {
        keys: [['shift', 'meta', '.']],
        label: 'Show hidden folders',
        description: 'In the notes folder picker (Settings), as in Finder.',
      },
    ],
  },
  {
    id: 'tabs',
    title: 'Tabs',
    description:
      'A click in the pages tree previews a page (in italics: replaced by the next one, closed once you leave it); a double click, or editing it, keeps it open. ⌘W and ⌘⇧T work in the installed app: in a browser tab, they’re the browser’s.',
    icon: 'i-lucide-panels-top-left',
    shortcuts: [
      {
        keys: [['meta', 'w']],
        label: 'Close the tab',
        description:
          'Or its ×, or a middle click on it. The tab used before it shows. With no tab open, closes Tandem, asking first.',
      },
      { keys: [['meta', 'shift', 't']], label: 'Reopen the closed tab' },
      {
        keys: [
          ['ctrl', 'meta', 'arrowright'],
          ['ctrl', 'meta', 'arrowleft'],
        ],
        label: 'Next or previous tab',
        description: 'Anywhere, even on a day’s note. On a Mac (elsewhere, ⌃1…⌃9).',
      },
      {
        keys: [
          ['meta', 'alt', 'arrowright'],
          ['meta', 'alt', 'arrowleft'],
        ],
        label: 'Next or previous tab, or day',
        description:
          'On a day’s note, the next or previous day (in the same tab); elsewhere, the next or previous tab. In the installed app: in a browser tab, they switch the browser’s tabs.',
      },
      {
        keys: [
          ['meta', 'alt', 'arrowdown'],
          ['meta', 'alt', 'arrowup'],
        ],
        label: 'A week later or earlier',
        description: 'On a day’s note (daily notes), in the same tab.',
      },
      {
        keys: [
          ['ctrl', '1'],
          ['ctrl', '9'],
        ],
        label: 'Go to tab 1 to 8, or the last one',
        description: '⌃1 to ⌃8, and ⌃9 for the last one.',
      },
    ],
  },
  {
    id: 'find',
    title: 'Find in the note',
    description: 'As in VS Code: the matches are highlighted, the current one selected.',
    icon: 'i-lucide-text-search',
    shortcuts: [
      { keys: [['meta', 'f']], label: 'Find', description: 'Starts from the selected text.' },
      { keys: [['meta', 'alt', 'f']], label: 'Find and replace' },
      { keys: [['enter'], ['shift', 'enter']], label: 'Next or previous match' },
      {
        keys: [['meta', 'enter']],
        label: 'Replace all',
        description: 'In the replace field; ↵ replaces the current match.',
      },
      {
        keys: [['escape']],
        label: 'Close',
        description: 'Back to the note, on the current match.',
      },
    ],
  },
  {
    id: 'tree',
    title: 'Pages tree',
    description: 'On the page or folder focused in the sidebar (click it, or Tab to the tree).',
    icon: 'i-lucide-list-tree',
    shortcuts: [
      {
        keys: [['arrowup'], ['arrowdown']],
        label: 'Previous or next item',
        description: 'Previews it, as a click does, once you stop on it.',
      },
      { keys: [['arrowright'], ['arrowleft']], label: 'Expand or collapse' },
      {
        keys: [['enter']],
        label: 'Open in its own tab',
        description: 'As a double click: the preview is kept open.',
      },
      { keys: [['F2']], label: 'Rename' },
      {
        keys: [
          ['alt', 'arrowup'],
          ['alt', 'arrowdown'],
        ],
        label: 'Move up or down',
      },
      {
        keys: [['meta', 'backspace'], ['delete']],
        label: 'Move to the trash',
        description:
          'Undo from the message that appears. With the trash off (Settings), asks, then deletes forever.',
      },
    ],
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    description:
      'On the bookmark or folder focused in the sidebar’s Bookmarks (with bookmarks on, in Settings › Features).',
    icon: 'i-lucide-bookmark',
    shortcuts: [
      {
        keys: [['arrowup'], ['arrowdown']],
        label: 'Previous or next bookmark',
        description: 'Opens its page, as a click does, once you stop on it.',
      },
      { keys: [['arrowright'], ['arrowleft']], label: 'Expand or collapse a folder' },
      {
        keys: [['enter']],
        label: 'Open the website',
        description: 'In a new browser tab, as a double click. On a folder, its page in a tab.',
      },
      { keys: [['F2']], label: 'Rename' },
      {
        keys: [
          ['alt', 'arrowup'],
          ['alt', 'arrowdown'],
        ],
        label: 'Move up or down',
      },
      {
        keys: [['meta', 'backspace'], ['delete']],
        label: 'Delete',
        description: 'Asks first, naming the pages that show it: their cards go with it.',
      },
    ],
  },
  {
    id: 'blocks',
    title: 'Lines and blocks',
    description:
      'As in VS Code, for the paragraph, heading or list item holding the cursor (or every block of the selection).',
    icon: 'i-lucide-rows-3',
    shortcuts: [
      {
        keys: [
          ['alt', 'arrowup'],
          ['alt', 'arrowdown'],
        ],
        label: 'Move up or down',
        description: 'List items move within their list.',
      },
      {
        keys: [
          ['shift', 'alt', 'arrowup'],
          ['shift', 'alt', 'arrowdown'],
        ],
        label: 'Duplicate above or below',
      },
      { keys: [['meta', 'shift', 'k']], label: 'Delete the block' },
      {
        keys: [['meta', 'enter']],
        label: 'Insert a line below',
        description: 'A new item, in a list.',
      },
      { keys: [['meta', 'shift', 'enter']], label: 'Insert a line above' },
      {
        keys: [['tab'], ['shift', 'tab']],
        label: 'Indent or outdent a list item',
        description:
          'One level, taking that level’s kind. Enter in an empty item and Backspace at its start outdent too.',
      },
      {
        keys: [['shift', 'enter']],
        label: 'Line break',
        description: 'A new line in the same paragraph.',
      },
    ],
  },
  {
    id: 'selections',
    title: 'Multiple selections',
    description: 'Edit every occurrence of a word at once, as with ⌘D in VS Code.',
    icon: 'i-lucide-text-cursor-input',
    shortcuts: [
      {
        keys: [['meta', 'd']],
        label: 'Select the word, then the next occurrence',
        description: 'Press again to add more.',
      },
      { keys: [['meta', 'shift', 'l']], label: 'Select all occurrences' },
      {
        keys: [['escape']],
        label: 'Back to a single selection',
        description: 'Clicking or moving the cursor does too.',
      },
    ],
  },
  {
    id: 'formatting',
    title: 'Formatting',
    description: 'On the selection, or on what you type next.',
    icon: 'i-lucide-bold',
    shortcuts: [
      { keys: [['meta', 'b']], label: 'Bold' },
      { keys: [['meta', 'i']], label: 'Italic' },
      { keys: [['meta', 'u']], label: 'Underline' },
      { keys: [['meta', 'shift', 's']], label: 'Strikethrough' },
      { keys: [['meta', 'e']], label: 'Inline code' },
      {
        keys: [
          ['meta', 'alt', '1'],
          ['meta', 'alt', '2'],
          ['meta', 'alt', '3'],
        ],
        label: 'Heading 1, 2, 3',
      },
      { keys: [['meta', 'alt', '0']], label: 'Paragraph' },
      { keys: [['meta', 'shift', '8']], label: 'Bullet list' },
      { keys: [['meta', 'shift', '7']], label: 'Numbered list' },
      { keys: [['meta', 'shift', '9']], label: 'To-do list' },
      { keys: [['meta', 'shift', 'b']], label: 'Quote' },
      { keys: [['meta', 'alt', 'c']], label: 'Code block' },
      {
        keys: [
          ['meta', 'z'],
          ['meta', 'shift', 'z'],
        ],
        label: 'Undo, redo',
      },
    ],
  },
  {
    id: 'typing',
    title: 'While typing',
    description: 'Markdown you type turns into formatting.',
    icon: 'i-lucide-keyboard',
    shortcuts: [
      {
        typed: '/',
        label: 'Block menu',
        description: 'Headings, lists, tables, databases, callouts, diagrams, files…',
      },
      { typed: '[[', label: 'Link to a note' },
      { typed: ':smile', label: 'Emoji' },
      { typed: '# ', label: 'Heading', description: '## and ### for smaller ones.' },
      { typed: '- ', label: 'Bullet list' },
      { typed: '1. ', label: 'Numbered list' },
      {
        typed: '[ ] ',
        label: 'To-do',
        description:
          'Or [] . At the start of a list item, - 1. and [ ] change its level’s kind: any kind at any level.',
      },
      { typed: '> ', label: 'Quote' },
      { typed: '``` ', label: 'Code block', description: 'Or ```ts and a space, for a language.' },
      { typed: '---', label: 'Divider' },
      { typed: '**bold**', label: 'Bold' },
      { typed: '*italic*', label: 'Italic' },
      { typed: '`code`', label: 'Inline code' },
      { typed: '~~strike~~', label: 'Strikethrough' },
    ],
  },
]
