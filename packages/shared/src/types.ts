// Shapes of the data the API returns. Dates are epoch milliseconds.
import type { Todo } from './todos.ts'

export type NodeKind = 'page' | 'folder'

/** A custom icon of a page or folder; images are served by the API (`url`). */
export type NodeIcon = { type: 'emoji'; emoji: string } | { type: 'image'; url: string }

/** A page or a folder of the tree. `parentId` is null at the root. */
export interface TreeNode {
  id: string
  kind: NodeKind
  title: string
  /** Relative to the data folder, with `/`: `Projects/Foo.md` for a page, `Projects` for a folder. */
  path: string
  parentId: string | null
  position: number
  createdAt: number
  updatedAt: number
  /** Null: the default page or folder icon. */
  icon: NodeIcon | null
  /**
   * No content: a folder on disk (no `.md`), or a blank page. Every node is a page to the user;
   * one with no content and child pages shows as a folder, and is one on disk once saved so.
   */
  empty: boolean
}

export interface Attachment {
  name: string
  /** Path to use in the note's Markdown, relative to the note (`Foo.assets/a%20b.png`). */
  markdownPath: string
  /** Path relative to the data folder, for `/files/<path>` URLs. */
  path: string
  size: number
  isImage: boolean
}

export interface NoteDetail {
  node: TreeNode
  content: string
  /** Hash of `content`, sent back on save to detect concurrent changes. */
  hash: string
  tags: string[]
  attachments: Attachment[]
  lastAuthor: string | null
}

export interface Backlink {
  id: string
  title: string
  path: string
}

export interface HistoryVersion {
  id: string
  noteId: string
  createdAt: number
  author: string
  size: number
}

/** Authorship of a run of consecutive lines of the current content. */
export interface BlameRange {
  /** First line (0-based) and number of lines. */
  start: number
  count: number
  author: string
  at: number
}

export interface SearchResult {
  id: string
  title: string
  path: string
  /** Snippet of the body, with matches wrapped in `<mark>` (all other text is HTML-escaped). */
  snippet: string
  /** Attachment file names that matched. */
  attachments: string[]
  tags: string[]
  updatedAt: number
  icon: NodeIcon | null
}

export interface SearchResponse {
  results: SearchResult[]
  /** Set when unknown words were replaced by close ones ("Showing results for …"). */
  correctedQuery: string | null
}

/** A page's TODOs (see todos.ts), for the TODOs page. */
export interface NoteTodos {
  id: string
  title: string
  path: string
  todos: Todo[]
}

export interface TagCount {
  tag: string
  count: number
}

export interface TrashItem {
  id: string
  title: string
  kind: NodeKind
  originalPath: string
  deletedAt: number
  /** Number of pages inside (the item itself included, for a page). */
  pageCount: number
}

/** The notes folder in use, and whether it can be changed from the app. */
export interface NotesFolder {
  path: string
  /** Null when Settings can change it; otherwise why not (e.g. a Docker mount). */
  readOnlyReason: string | null
}

/** A folder, as the notes folder picker shows it (the server lists folders: a browser can't). */
export interface FolderListing {
  path: string
  /** Null at the top of the disk. */
  parent: string | null
  /** `app`: an app's iCloud folder, shown in iCloud Drive as Finder does (named after the app). */
  folders: { name: string; path: string; app?: boolean }[]
  /** It already holds Tandem notes (a `.tandem` folder). */
  tandem: boolean
  /** Markdown files directly inside: they become notes. */
  markdownFiles: number
  /** Null when it can be the notes folder; otherwise why not. */
  problem: string | null
  /** Home, Documents, iCloud Drive, OneDrive…: those that exist. */
  places: { label: string; path: string }[]
}

/**
 * Color themes of code blocks, each a light and a dark variant (as the background tones): the
 * light one in light mode, the dark one in dark mode.
 */
export const CODE_THEMES = [
  'tandem',
  'github',
  'one',
  'dracula',
  'nord',
  'solarized',
  'tomorrow',
] as const
/** Themes saved before they came in pairs, and their pair. */
export const LEGACY_CODE_THEMES: Record<string, (typeof CODE_THEMES)[number]> = {
  'github-dark': 'github',
  'one-dark': 'one',
  'solarized-light': 'solarized',
  'tomorrow-night-eighties': 'tomorrow',
}
export type CodeTheme = (typeof CODE_THEMES)[number]

export interface Settings {
  /** Shown next to the logo and in the browser tab. */
  workspaceName: string
  displayName: string
  primaryColor: string
  neutralColor: string
  radius: number
  editorFont: 'sans' | 'serif' | 'mono' | 'system'
  editorWidth: 'narrow' | 'medium' | 'wide' | 'full'
  /** Text size in notes only (not in the interface). */
  editorFontSize: 'small' | 'medium' | 'large' | 'xlarge'
  /** Tint of the backgrounds and borders, in light and dark mode. */
  backgroundTone: 'white' | 'paper' | 'sepia' | 'cool'
  /** Colors of code blocks (syntax highlighting and background). */
  codeTheme: CodeTheme
  /** The browser's spell checking while typing (notes, titles, fields). */
  spellcheck: boolean
  /**
   * Optional features, shown or not (Settings › Features). Turned off, a feature only hides:
   * its data stays (a note's tags, its TODO lines), and agents can still use it.
   */
  tags: boolean
  /** Off: a deleted page is deleted for good, once confirmed, instead of going to the trash. */
  trash: boolean
  todos: boolean
  /** Daily notes: a note per day, reached from a calendar (shared/calendar.ts). */
  daily: boolean
  /** Home lists the recently updated pages. */
  homeRecent: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  workspaceName: 'Tandem',
  displayName: 'Me',
  primaryColor: 'amber',
  neutralColor: 'zinc',
  radius: 0.375,
  editorFont: 'sans',
  editorWidth: 'medium',
  editorFontSize: 'medium',
  backgroundTone: 'white',
  codeTheme: 'tandem',
  spellcheck: false,
  tags: false,
  trash: true,
  todos: false,
  daily: false,
  homeRecent: true,
}

/** Server-sent events, on `/api/events`. */
export type ServerEvent =
  | { type: 'tree' }
  | { type: 'note'; id: string; hash: string; author: string }
  | { type: 'trash' }
  | { type: 'settings' }
  /** A database changed (its columns, view or rows). */
  | { type: 'database'; id: string }
