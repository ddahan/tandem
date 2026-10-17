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
    description: 'Anywhere in Myfluence.',
    icon: 'i-lucide-app-window',
    shortcuts: [
      {
        keys: [['meta', 'shift', 'f']],
        label: 'Search in all notes',
        description:
          'Notes, text and attachment names, and actions; starts from the selected text, if any.',
      },
      { keys: [['meta', 'alt', 'n']], label: 'New page' },
      { keys: [['meta', '/']], label: 'Keyboard shortcuts', description: 'This page.' },
      {
        keys: [['meta', '\\']],
        label: 'Show or hide the side panel',
        description: 'In a note: outline, links, history, files.',
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
      { keys: [['arrowup'], ['arrowdown']], label: 'Previous or next item' },
      { keys: [['arrowright'], ['arrowleft']], label: 'Expand or collapse' },
      { keys: [['enter']], label: 'Open' },
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
        description: 'Undo from the message that appears.',
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
      { keys: [['tab'], ['shift', 'tab']], label: 'Indent or outdent a list item' },
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
        description: 'Headings, lists, tables, callouts, diagrams, files…',
      },
      { typed: '[[', label: 'Link to a note' },
      { typed: ':smile', label: 'Emoji' },
      { typed: '# ', label: 'Heading', description: '## and ### for smaller ones.' },
      { typed: '- ', label: 'Bullet list' },
      { typed: '1. ', label: 'Numbered list' },
      { typed: '[ ] ', label: 'To-do' },
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
