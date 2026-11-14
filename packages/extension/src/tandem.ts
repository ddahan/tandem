// Talking to the Tandem running on this computer, from the extension (its popup, its service
// worker). Its requests carry the extension's origin, which Tandem accepts changes from (the
// server's api/guard.ts), and which it tells when bookmarks are off (a 409 with a code).
import {
  BOOKMARKS_OFF,
  type Bookmark,
  type BookmarkImportNode,
  type BookmarkImportResult,
  type BookmarkSearchResult,
} from '@tandem/shared'

/** Where Tandem answers by default (the installer's port). */
export const DEFAULT_ADDRESS = 'http://localhost:3864'

/** Why Tandem can't be used: not running there, bookmarks off, or anything else. */
export type Problem = 'offline' | 'off' | 'error'

export class TandemError extends Error {
  readonly problem: Problem
  readonly status: number
  /** Tandem's answer, if any (a duplicate's names its bookmark). */
  readonly body: unknown

  constructor(problem: Problem, message: string, status = 0, body: unknown = null) {
    super(message)
    this.problem = problem
    this.status = status
    this.body = body
  }
}

export interface BookmarkFields {
  url: string
  title: string
  description: string
  /** The favicon, as a `data:` URL (the browser has it). */
  iconDataUrl?: string
}

/** A saved bookmark, or the one already saved for this page. */
export type Saved = { bookmark: Bookmark; duplicate: boolean }

/**
 * The popup's save, sent to the service worker, which makes it: the popup closes at once (its
 * requests would stop with it), and the ✓ shows meanwhile. `id`: the bookmark to change.
 */
export interface SaveMessage {
  type: 'save'
  tabId: number
  id?: string
  fields: BookmarkFields
}

/** A Tandem address as typed: trimmed, without a final `/`, `http://` added when missing. */
export function normalizeAddress(input: string): string {
  const text = input.trim().replace(/\/+$/, '')
  if (!text) return DEFAULT_ADDRESS
  return /^https?:\/\//i.test(text) ? text : `http://${text}`
}

export function createTandem(address: string, fetcher: typeof fetch = fetch) {
  const base = normalizeAddress(address)

  async function request<T>(
    path: string,
    init: RequestInit = {},
    onStatus?: (status: number) => void,
  ): Promise<T> {
    let response: Response
    try {
      response = await fetcher(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
      })
    } catch {
      throw new TandemError('offline', `Tandem isn’t running at ${base}.`)
    }
    onStatus?.(response.status)
    const body = (await response.json().catch(() => null)) as
      | (T & { error?: string; code?: string })
      | null
    if (response.status === 409 && body?.code === BOOKMARKS_OFF) {
      throw new TandemError('off', 'Bookmarks are off in Tandem.', 409)
    }
    if (!response.ok) {
      throw new TandemError(
        'error',
        body?.error ?? `Tandem answered with an error (${response.status}).`,
        response.status,
        body,
      )
    }
    return body as T
  }

  /**
   * A create or change, the page's existing bookmark when it's already saved: a create answers
   * with it (200, not 201), a change of address to another bookmark's is refused naming it.
   */
  async function save(path: string, method: string, fields: object): Promise<Saved> {
    let status = 0
    try {
      const bookmark = await request<Bookmark>(
        path,
        { method, body: JSON.stringify(fields) },
        (s) => (status = s),
      )
      return { bookmark, duplicate: method === 'POST' && status === 200 }
    } catch (error) {
      const existing =
        error instanceof TandemError && error.status === 409
          ? (error.body as { bookmark?: Bookmark } | null)?.bookmark
          : undefined
      if (existing) return { bookmark: existing, duplicate: true }
      throw error
    }
  }

  return {
    address: base,
    /** Whether bookmarks are on (Settings › Features). */
    async enabled(): Promise<boolean> {
      return (await request<{ enabled: boolean }>('/api/bookmarks/status')).enabled
    },
    list: () => request<Bookmark[]>('/api/bookmarks'),
    /** The bookmark of this page, if it's saved. */
    lookup: async (url: string) =>
      (
        await request<{ bookmark: Bookmark | null }>(
          `/api/bookmarks/lookup?url=${encodeURIComponent(url)}`,
        )
      ).bookmark,
    search: (query: string, limit = 6) =>
      request<BookmarkSearchResult[]>(
        `/api/bookmarks/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      ),
    /** A new bookmark, its card at the start of the inbox note ("Unsorted" in Tandem). */
    create: (fields: BookmarkFields) => save('/api/bookmarks', 'POST', { ...fields, inbox: true }),
    update: (id: string, fields: Partial<BookmarkFields>) =>
      save(`/api/bookmarks/${encodeURIComponent(id)}`, 'PATCH', fields),
    /** Imports a browser's tree into Tandem's inbox note (see import.ts). */
    importBookmarks: (children: BookmarkImportNode[]) =>
      request<BookmarkImportResult>('/api/bookmarks/import', {
        method: 'POST',
        body: JSON.stringify({ children }),
      }),
  }
}

export type Tandem = ReturnType<typeof createTandem>

/** Where a bookmark is, for the popup: `In 2 notes`, or `In no note` (deleted cards). */
export function whereShown(bookmark: Bookmark): string {
  if (!bookmark.uses) return 'In no note'
  return `In ${bookmark.uses} note${bookmark.uses === 1 ? '' : 's'}`
}
