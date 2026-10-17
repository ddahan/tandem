// Shapes of the data the API returns. Dates are epoch milliseconds.

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
}

export const DEFAULT_SETTINGS: Settings = {
  workspaceName: 'Tandem',
  displayName: 'Me',
  primaryColor: 'indigo',
  neutralColor: 'zinc',
  radius: 0.375,
  editorFont: 'sans',
  editorWidth: 'medium',
  editorFontSize: 'medium',
  backgroundTone: 'white',
}

/** Server-sent events, on `/api/events`. */
export type ServerEvent =
  | { type: 'tree' }
  | { type: 'note'; id: string; hash: string; author: string }
  | { type: 'trash' }
  | { type: 'settings' }
