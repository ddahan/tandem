// Bookmarks: links to websites kept in Tandem (SQLite), one per web page, organized by the
// notes showing them as cards. A note only has a block naming one, as for databases:
//
//   ```bookmark
//   id: Kx3fq9P2mZ0a
//   ```
//
// Bookmarks saved from the browser go into the inbox note (`Settings.bookmarkInbox`), shown as
// "Unsorted" in the sidebar, until they are moved into other notes.
// Their rules, shared by the server, the web app, the CLI and the browser extension.

/** Tandem's Chrome extension: its id is fixed by the public key in its manifest. */
export const EXTENSION_ID = 'kmecpgdldjmbehndpobipnndopjdgkci'
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

/** The error code of a bookmark request from the extension while bookmarks are off. */
export const BOOKMARKS_OFF = 'bookmarks_off'

/** The title of the inbox note, made at the top when bookmarks need one and there is none. */
export const BOOKMARK_INBOX_TITLE = 'Bookmarks'

/** A bookmark: a web page saved, shown as cards in notes. */
export interface Bookmark {
  id: string
  title: string
  url: string
  /** Optional; the page's meta description when it was saved. */
  description: string
  /** The favicon's (or chosen image's) address in the API, or null (none: a globe). */
  icon: string | null
  /** An emoji chosen as its icon, shown instead of the image or default. */
  emoji: string | null
  /** How many notes show its card ("Used 3 times" from 2 on). */
  uses: number
  createdAt: number
  updatedAt: number
}

/** A page that shows a bookmark's card. */
export interface BookmarkRef {
  id: string
  title: string
  path: string
}

/** A bookmark found by a search, with the words that matched marked in its title. */
export interface BookmarkSearchResult {
  bookmark: Bookmark
  /** The title with matches wrapped in `<mark>` (all other text is HTML-escaped). */
  titleHtml: string
}

/** The inbox note and the bookmarks it shows, in order: those still to sort. */
export interface UnsortedBookmarks {
  /** The inbox note's id, or null when there is none (yet, or it was deleted). */
  noteId: string | null
  bookmarks: Bookmark[]
}

/** What a web page says about itself, read when it is bookmarked. */
export interface PagePreview {
  url: string
  title: string
  description: string
}

/**
 * A browser's bookmark or folder, as imported (the extension sends Chrome's tree): a folder has
 * `children`, a bookmark a `url` (and its favicon, as a `data:` URL, when the browser has one).
 */
export interface BookmarkImportNode {
  title: string
  url?: string
  iconDataUrl?: string
  children?: BookmarkImportNode[]
}

/**
 * What an import did: into which note (the inbox, where the browser's folders are headings),
 * what it added, what it left out.
 */
export interface BookmarkImportResult {
  noteId: string
  bookmarks: number
  /** Pages already bookmarked in Tandem (or twice in the import): kept as they were. */
  duplicates: number
  /** Not web addresses (`javascript:` bookmarklets, `chrome://` pages): left out. */
  skipped: number
}

/** At most this many bookmarks and folders in one import. */
export const BOOKMARK_IMPORT_MAX = 20_000

/** Lengths kept (longer values are cut). */
export const BOOKMARK_TITLE_MAX = 300
export const BOOKMARK_DESCRIPTION_MAX = 1000
export const BOOKMARK_URL_MAX = 4000

/**
 * The URL as typed or copied, made usable: trimmed, `https://` added when there's no scheme.
 * Only web addresses (http, https): a bookmark opens in a browser tab, and anything else
 * (`javascript:`, `file:`) is refused. Null when it isn't one.
 */
export function webUrl(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return url.href.length > BOOKMARK_URL_MAX ? null : url.href
}

/**
 * The key two bookmarks are duplicates by: the URL without its `#fragment`, `www.`, the
 * scheme's difference (http/https) or a trailing `/`. Case is kept in the path and query,
 * which servers may tell apart.
 */
export function urlKey(input: string): string {
  try {
    const url = new URL(input)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const port = url.port ? `:${url.port}` : ''
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${port}${path}${url.search}`
  } catch {
    return input.trim()
  }
}

/** The site, as shown under a bookmark's title: `github.com`. */
export function siteOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '')
  } catch {
    return input
  }
}

/** The Markdown of a `bookmark` block. */
export function bookmarkBlock(id: string): string {
  return `\`\`\`bookmark\nid: ${id}\n\`\`\``
}

const BLOCKS = /^```bookmark[ \t]*\n([\s\S]*?)^```[ \t]*$/gm

/** The ids of the bookmarks a note's Markdown shows, in order (its `bookmark` blocks). */
export function bookmarkIdsIn(markdown: string): string[] {
  const ids: string[] = []
  for (const match of markdown.matchAll(BLOCKS)) {
    const id = /^id:[ \t]*(\S+)/m.exec(match[1] ?? '')?.[1]
    if (id) ids.push(id)
  }
  return ids
}

/**
 * The Markdown without the blocks of these bookmarks (deleted), and the blank lines they
 * leave. Unchanged when it shows none of them.
 */
export function removeBookmarkBlocks(markdown: string, ids: Iterable<string>): string {
  const gone = new Set(ids)
  let removed = false
  const result = markdown.replace(
    /^```bookmark[ \t]*\n([\s\S]*?)^```[ \t]*(?:\n|$)/gm,
    (block, body: string) => {
      const id = /^id:[ \t]*(\S+)/m.exec(body)?.[1]
      if (!id || !gone.has(id)) return block
      removed = true
      return ''
    },
  )
  return removed ? result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '') : markdown
}

/** A link to a website in a note's text: `[text](https://…)`, `<https://…>` or a bare address. */
export interface ExternalLink {
  text: string
  url: string
}

const CODE = /^(```|~~~)[\s\S]*?^\1[ \t]*$|`[^`\n]*`/gm
const LINKS =
  /!?\[((?:\\.|[^\]\\])*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)|<(https?:\/\/[^\s>]+)>|(https?:\/\/[^\s<>()[\]`]+[^\s<>()[\]`.,;:!?'"*_~])/gi

/**
 * The links to websites in a note's text, in order, each address once (its first text): what
 * the Bookmarks panel lists besides the cards. Not those in code, nor images (`![…](…)`).
 */
export function externalLinksIn(markdown: string): ExternalLink[] {
  const text = markdown.replace(CODE, (code) => ' '.repeat(code.length))
  const seen = new Set<string>()
  const result: ExternalLink[] = []
  for (const match of text.matchAll(LINKS)) {
    if (match[0].startsWith('!')) continue
    const url = webUrl(match[2] ?? match[3] ?? match[4] ?? '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    const label = (match[1] ?? '').replace(/\\(.)/g, '$1').trim()
    result.push({ text: label || siteOf(url), url })
  }
  return result
}
