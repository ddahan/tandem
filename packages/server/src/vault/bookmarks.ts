// Bookmarks and their folders, in SQLite (see @tandem/shared's bookmarks.ts). The vault calls
// these under its lock and announces the changes; it also keeps which pages show which
// bookmark (`bookmark_refs`, filled when a page is indexed).
//
// Search runs in memory: bookmarks are a few thousand at most, and their text is short (a
// title, an address, a description). It reads queries as the notes' search does (prefixes,
// accents ignored, "phrases", -word, in:Folder), with typos corrected.
import { asc, eq, inArray, like } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  BOOKMARK_DESCRIPTION_MAX,
  BOOKMARK_TITLE_MAX,
  siteOf,
  urlKey,
  webUrl,
  type Bookmark,
  type BookmarkImportResult,
  type BookmarkKind,
  type BookmarkSearchResult,
} from '@tandem/shared'
import type { Db } from '../db/client.ts'
import { bookmarks } from '../db/schema.ts'
import { NotFoundError, ValidationError } from './errors.ts'
import { editDistance, parseQuery } from './search.ts'
import { escapeHtml, foldText } from './text.ts'

export interface BookmarkInput {
  kind?: BookmarkKind
  parentId?: string | null
  title?: string
  url?: string
  description?: string
  /** Place among the folder's bookmarks (default: last). */
  index?: number
  /** Instead of `parentId`: a folder's id or path of names (`Work/Tools`), made if missing. */
  folder?: string
}

export interface BookmarkPatch {
  title?: string
  url?: string
  description?: string
  /** Moves it to another folder (null: the top), last unless `index` says where. */
  parentId?: string | null
  index?: number
  /** Instead of `parentId`: a folder's id or path of names (`Work/Tools`), made if missing. */
  folder?: string
}

/** A folder or a bookmark to import, with whatever goes with it (its favicon) for the vault. */
export interface ImportNode<T> {
  title: string
  url?: string
  children?: ImportNode<T>[]
  extra?: T
}

// Letters and digits only: ids are typed in commands, where one starting with "-" would read
// as an option (as databases' ids).
const newId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12)

type BookmarkRecord = typeof bookmarks.$inferSelect

/** The prefix of bookmarks' icon files in `.tandem/icons/` (pages' start with their id). */
export const BOOKMARK_ICON_PREFIX = 'bookmark-'

export class BookmarkStore {
  private readonly db: Db
  private readonly now: () => number

  constructor(db: Db, now: () => number) {
    this.db = db
    this.now = now
  }

  /** Every bookmark and folder, in order within each folder. */
  async list(): Promise<Bookmark[]> {
    const records = await this.db.select().from(bookmarks).orderBy(asc(bookmarks.position))
    return records.map(toBookmark)
  }

  async get(id: string): Promise<Bookmark> {
    return toBookmark(await this.record(id))
  }

  /** The bookmark of this page (same `urlKey`), if there is one. */
  async findByUrl(url: string): Promise<Bookmark | null> {
    const valid = webUrl(url)
    if (!valid) return null
    const record = await this.db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.urlKey, urlKey(valid)))
      .get()
    return record ? toBookmark(record) : null
  }

  /** A new bookmark or folder. Duplicates are the vault's to refuse (findByUrl). */
  async create(input: BookmarkInput): Promise<Bookmark> {
    const kind = input.kind ?? 'bookmark'
    const parentId =
      input.folder !== undefined ? await this.folder(input.folder) : (input.parentId ?? null)
    await this.checkParent(parentId)
    let url = ''
    if (kind === 'bookmark') {
      url = webUrl(input.url ?? '') ?? ''
      if (!url) throw new ValidationError('A bookmark needs a web address (http or https)')
    }
    const title =
      clip(input.title ?? '', BOOKMARK_TITLE_MAX) || (kind === 'folder' ? '' : siteOf(url))
    if (!title) throw new ValidationError('A folder needs a name')
    const id = newId()
    const now = this.now()
    await this.db.insert(bookmarks).values({
      id,
      kind,
      parentId,
      title,
      url,
      urlKey: url ? urlKey(url) : '',
      description: kind === 'folder' ? '' : clip(input.description ?? '', BOOKMARK_DESCRIPTION_MAX),
      position: 0,
      createdAt: now,
      updatedAt: now,
    })
    await this.place(id, parentId, input.index)
    return this.get(id)
  }

  async update(id: string, patch: BookmarkPatch): Promise<Bookmark> {
    const record = await this.record(id)
    const changes: Partial<BookmarkRecord> = { updatedAt: this.now() }
    if (patch.title !== undefined) {
      const title = clip(patch.title, BOOKMARK_TITLE_MAX)
      if (!title) throw new ValidationError('The name can’t be empty')
      changes.title = title
    }
    if (patch.url !== undefined && record.kind === 'bookmark') {
      const url = webUrl(patch.url)
      if (!url) throw new ValidationError('A bookmark needs a web address (http or https)')
      changes.url = url
      changes.urlKey = urlKey(url)
    }
    if (patch.description !== undefined && record.kind === 'bookmark') {
      changes.description = clip(patch.description, BOOKMARK_DESCRIPTION_MAX)
    }
    await this.db.update(bookmarks).set(changes).where(eq(bookmarks.id, id))
    if (patch.folder !== undefined || patch.parentId !== undefined || patch.index !== undefined) {
      const parentId =
        patch.folder !== undefined
          ? await this.folder(patch.folder)
          : patch.parentId === undefined
            ? record.parentId
            : patch.parentId
      await this.checkParent(parentId, id)
      await this.db.update(bookmarks).set({ parentId }).where(eq(bookmarks.id, id))
      await this.place(id, parentId, patch.index)
    }
    return this.get(id)
  }

  /** The bookmark or folder and everything inside it, by id. */
  async subtree(id: string): Promise<Bookmark[]> {
    const all = await this.list()
    const root = all.find((bookmark) => bookmark.id === id)
    if (!root) throw new NotFoundError('No such bookmark')
    const result = [root]
    for (let i = 0; i < result.length; i++) {
      result.push(...all.filter((bookmark) => bookmark.parentId === result[i]!.id))
    }
    return result
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length) await this.db.delete(bookmarks).where(inArray(bookmarks.id, ids))
  }

  /** Sets (or clears) the favicon file; returns the previous one, to delete. */
  async setIcon(id: string, file: string | null): Promise<string | null> {
    const record = await this.record(id)
    await this.db
      .update(bookmarks)
      .set({ icon: file ? `image:${file}` : null })
      .where(eq(bookmarks.id, id))
    return record.icon?.startsWith('image:') ? record.icon.slice(6) : null
  }

  /** Sets an emoji as its icon (or none); returns the image file it had, to delete. */
  async setEmoji(id: string, emoji: string | null): Promise<string | null> {
    const record = await this.record(id)
    await this.db
      .update(bookmarks)
      .set({ icon: emoji ? `emoji:${emoji}` : null })
      .where(eq(bookmarks.id, id))
    return record.icon?.startsWith('image:') ? record.icon.slice(6) : null
  }

  /** The favicon's file name in `.tandem/icons/`. */
  async iconFile(id: string): Promise<string> {
    const record = await this.record(id)
    if (!record.icon?.startsWith('image:')) throw new NotFoundError('No icon')
    return record.icon.slice(6)
  }

  /** The favicons' file names in `.tandem/icons/`, by bookmark id. */
  async iconFiles(): Promise<Map<string, string>> {
    const records = await this.db
      .select({ id: bookmarks.id, icon: bookmarks.icon })
      .from(bookmarks)
      .where(like(bookmarks.icon, 'image:%'))
    return new Map(records.map((record) => [record.id, record.icon!.slice(6)]))
  }

  /** Bookmarks matching a query, best first; with no words, the most recently changed. */
  async search(query: string, limit = 20): Promise<BookmarkSearchResult[]> {
    const all = await this.list()
    const byId = new Map(all.map((bookmark) => [bookmark.id, bookmark]))
    const folders = (bookmark: Bookmark) => {
      const names: string[] = []
      let parent = bookmark.parentId ? byId.get(bookmark.parentId) : undefined
      while (parent) {
        names.unshift(parent.title)
        parent = parent.parentId ? byId.get(parent.parentId) : undefined
      }
      return names
    }
    const parsed = parseQuery(query)
    // Bookmarks have no tags: a tag filter leaves none.
    if (parsed.tags.length) return []
    const candidates = all
      .filter((bookmark) => bookmark.kind === 'bookmark')
      .map((bookmark) => ({ bookmark, folders: folders(bookmark), fields: fieldsOf(bookmark) }))
      .filter(({ folders: names }) =>
        parsed.folders.every((folder) => {
          const prefix = foldText(folder)
          const path = foldText(names.join('/'))
          return path === prefix || path.startsWith(`${prefix}/`) || path.includes(`/${prefix}`)
        }),
      )

    if (!parsed.words.length && !parsed.phrases.length) {
      return candidates
        .filter(({ fields }) => !parsed.excluded.some((word) => matchIn(fields, word)))
        .toSorted((a, b) => b.bookmark.updatedAt - a.bookmark.updatedAt)
        .slice(0, limit)
        .map(({ bookmark, folders: names }) => toResult(bookmark, names, []))
    }

    // Typo tolerance: a word that starts no word of any bookmark is replaced by the closest.
    const vocabulary = new Set(candidates.flatMap(({ fields }) => fields.flatMap((f) => f.words)))
    const words = parsed.words.map((word) =>
      [...vocabulary].some((known) => known.startsWith(word))
        ? word
        : (closest(word, vocabulary) ?? word),
    )

    const scored: { score: number; bookmark: Bookmark; folders: string[] }[] = []
    for (const { bookmark, folders: names, fields } of candidates) {
      if (parsed.excluded.some((word) => matchIn(fields, word))) continue
      if (!parsed.phrases.every((phrase) => fields.some((field) => field.text.includes(phrase))))
        continue
      let score = parsed.phrases.length * 5
      let matched = true
      for (const word of words) {
        const best = Math.max(...fields.map((field) => fieldScore(field, word)))
        if (best === 0) {
          matched = false
          break
        }
        score += best
      }
      if (matched) scored.push({ score, bookmark, folders: names })
    }
    return scored
      .toSorted((a, b) => b.score - a.score || b.bookmark.updatedAt - a.bookmark.updatedAt)
      .slice(0, limit)
      .map(({ bookmark, folders: names }) => toResult(bookmark, names, words))
  }

  /** A folder by id, or by path of names (any case), its missing folders made; '' is the top. */
  private async folder(ref: string): Promise<string | null> {
    const all = await this.list()
    const byId = all.find((bookmark) => bookmark.id === ref && bookmark.kind === 'folder')
    if (byId) return byId.id
    let parentId: string | null = null
    for (const name of ref
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const existing = all.find(
        (bookmark) =>
          bookmark.kind === 'folder' &&
          bookmark.parentId === parentId &&
          bookmark.title.toLowerCase() === name.toLowerCase(),
      )
      parentId = existing
        ? existing.id
        : (await this.create({ kind: 'folder', title: name, parentId })).id
    }
    return parentId
  }

  /**
   * Imports a browser's tree into the folder `into` at the top (made if missing). Folders merge
   * with those of the same name (any case) where they go, so that importing again only adds
   * what is new; pages already bookmarked, and what isn't a web address, are left out. In one
   * go (the folder's rows read once, positions given), however many there are. Returns what was
   * made, each bookmark with its `extra`.
   */
  async importTree<T>(
    into: string,
    nodes: ImportNode<T>[],
  ): Promise<{ result: BookmarkImportResult; created: { id: string; extra: T }[] }> {
    const all = await this.list()
    const known = new Set(all.filter((b) => b.kind === 'bookmark').map((b) => urlKey(b.url)))
    const children = new Map<string | null, Bookmark[]>()
    for (const bookmark of all) {
      const list = children.get(bookmark.parentId) ?? []
      list.push(bookmark)
      children.set(bookmark.parentId, list)
    }
    const next = (parentId: string | null) => {
      const list = children.get(parentId) ?? []
      return list.reduce((max, b) => Math.max(max, b.position), 0) + 1
    }
    const result = { folderId: '', folders: 0, bookmarks: 0, duplicates: 0, skipped: 0 }
    const created: { id: string; extra: T }[] = []
    const now = this.now()

    const insert = async (row: Omit<Bookmark, 'icon' | 'emoji' | 'createdAt' | 'updatedAt'>) => {
      await this.db.insert(bookmarks).values({
        ...row,
        urlKey: row.url ? urlKey(row.url) : '',
        createdAt: now,
        updatedAt: now,
      })
      const list = children.get(row.parentId) ?? []
      list.push({ ...row, icon: null, emoji: null, createdAt: now, updatedAt: now })
      children.set(row.parentId, list)
    }

    const folder = async (parentId: string | null, name: string) => {
      const title = clip(name, BOOKMARK_TITLE_MAX) || 'Untitled folder'
      const existing = children
        .get(parentId)
        ?.find((b) => b.kind === 'folder' && b.title.toLowerCase() === title.toLowerCase())
      if (existing) return existing.id
      const id = newId()
      await insert({
        id,
        kind: 'folder',
        parentId,
        title,
        url: '',
        description: '',
        position: next(parentId),
      })
      result.folders++
      return id
    }

    const walk = async (parentId: string, list: ImportNode<T>[]) => {
      for (const node of list) {
        if (node.children) {
          await walk(await folder(parentId, node.title), node.children)
          continue
        }
        const url = webUrl(node.url ?? '')
        if (!url) {
          result.skipped++
          continue
        }
        if (known.has(urlKey(url))) {
          result.duplicates++
          continue
        }
        known.add(urlKey(url))
        const id = newId()
        const title = clip(node.title, BOOKMARK_TITLE_MAX) || siteOf(url)
        await insert({
          id,
          kind: 'bookmark',
          parentId,
          title,
          url,
          description: '',
          position: next(parentId),
        })
        result.bookmarks++
        if (node.extra !== undefined) created.push({ id, extra: node.extra })
      }
    }

    result.folderId = await folder(null, into)
    await walk(result.folderId, nodes)
    return { result, created }
  }

  private async record(id: string): Promise<BookmarkRecord> {
    const record = await this.db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()
    if (!record) throw new NotFoundError('No such bookmark')
    return record
  }

  /** A folder (or the top), never inside the bookmark being moved (`moving`). */
  private async checkParent(parentId: string | null, moving?: string) {
    if (!parentId) return
    const parent = await this.db.select().from(bookmarks).where(eq(bookmarks.id, parentId)).get()
    if (!parent) throw new NotFoundError('No such folder')
    if (parent.kind !== 'folder') throw new ValidationError('Bookmarks go in folders only')
    if (moving && (await this.subtree(moving)).some((bookmark) => bookmark.id === parentId)) {
      throw new ValidationError('A folder can’t go inside itself')
    }
  }

  /** Puts a bookmark at `index` among its folder's (default: last), renumbering them. */
  private async place(id: string, parentId: string | null, index?: number) {
    const siblings = (await this.list()).filter(
      (bookmark) => bookmark.parentId === parentId && bookmark.id !== id,
    )
    const at = Math.max(0, Math.min(index ?? siblings.length, siblings.length))
    const ordered = [
      ...siblings.slice(0, at).map((b) => b.id),
      id,
      ...siblings.slice(at).map((b) => b.id),
    ]
    for (const [position, sibling] of ordered.entries()) {
      await this.db
        .update(bookmarks)
        .set({ position: position + 1 })
        .where(eq(bookmarks.id, sibling))
    }
  }
}

function toResult(bookmark: Bookmark, folders: string[], words: string[]): BookmarkSearchResult {
  return { bookmark, titleHtml: markWords(bookmark.title, words), folders: folders.join(' / ') }
}

function toBookmark(record: BookmarkRecord): Bookmark {
  return {
    id: record.id,
    kind: record.kind,
    parentId: record.parentId,
    title: record.title,
    url: record.url,
    description: record.description,
    icon: record.icon?.startsWith('image:')
      ? `/api/bookmarks/${record.id}/icon?v=${encodeURIComponent(record.icon.slice(6))}`
      : null,
    emoji: record.icon?.startsWith('emoji:') ? record.icon.slice(6) : null,
    position: record.position,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** Trimmed, on one line, and at most `max` characters. */
function clip(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

interface Field {
  /** Folded text, and its words. */
  text: string
  words: string[]
  /** How much a match here counts: the title most, then the address, then the description. */
  weight: number
}

function wordsOf(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+/gu) ?? []
}

function toField(text: string, weight: number): Field {
  const folded = foldText(text)
  return { text: folded, words: wordsOf(folded), weight }
}

function fieldsOf(bookmark: Bookmark): Field[] {
  return [
    toField(bookmark.title, 10),
    toField(`${siteOf(bookmark.url)} ${bookmark.url}`, 4),
    toField(bookmark.description, 1),
  ]
}

/** A word's score in a field: a word starting with it, or (3 letters or more) inside one. */
function fieldScore(field: Field, word: string): number {
  if (field.words.some((known) => known.startsWith(word))) return field.weight
  if (word.length >= 3 && field.text.includes(word)) return field.weight / 2
  return 0
}

function matchIn(fields: Field[], word: string): boolean {
  return fields.some((field) => field.words.some((known) => known.startsWith(word)))
}

/** The closest known word (as the notes' search: 1 typo up to 6 letters, 2 beyond). */
function closest(word: string, vocabulary: Set<string>): string | null {
  const max = word.length <= 3 ? 0 : word.length <= 6 ? 1 : 2
  if (max === 0) return null
  let best: { term: string; distance: number } | null = null
  for (const term of vocabulary) {
    const distance = Math.min(
      editDistance(word, term, max),
      term.length > word.length ? editDistance(word, term.slice(0, word.length), max) : max + 1,
    )
    if (distance <= max && (!best || distance < best.distance)) best = { term, distance }
  }
  return best?.term ?? null
}

/** The title, escaped, its words starting with a query word in `<mark>`. */
function markWords(title: string, words: string[]): string {
  if (!words.length) return escapeHtml(title)
  let html = ''
  let last = 0
  for (const match of title.matchAll(/[\p{L}\p{N}]+/gu)) {
    const folded = foldText(match[0])
    if (!words.some((word) => folded.startsWith(word))) continue
    html += `${escapeHtml(title.slice(last, match.index))}<mark>${escapeHtml(match[0])}</mark>`
    last = match.index + match[0].length
  }
  return html + escapeHtml(title.slice(last))
}
