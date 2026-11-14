// Bookmarks, in SQLite (see @tandem/shared's bookmarks.ts): one per web page, organized by the
// notes showing them. The vault calls these under its lock and announces the changes; it also
// keeps which pages show which bookmark (`bookmark_refs`, filled when a page is indexed).
//
// Search runs in memory: bookmarks are a few thousand at most, and their text is short (a
// title, an address, a description). It reads queries as the notes' search does (prefixes,
// accents ignored, "phrases", -word, in:Folder: the notes showing it), with typos corrected.
import { count, desc, eq, inArray, like } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  BOOKMARK_DESCRIPTION_MAX,
  BOOKMARK_TITLE_MAX,
  siteOf,
  urlKey,
  webUrl,
  type Bookmark,
  type BookmarkSearchResult,
} from '@tandem/shared'
import type { Db } from '../db/client.ts'
import { bookmarkRefs, bookmarks, nodes } from '../db/schema.ts'
import { NotFoundError, ValidationError } from './errors.ts'
import { editDistance, parseQuery } from './search.ts'
import { escapeHtml, foldText } from './text.ts'

export interface BookmarkInput {
  title?: string
  url?: string
  description?: string
}

export type BookmarkPatch = BookmarkInput

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

  /** Every bookmark, the latest first. */
  async list(): Promise<Bookmark[]> {
    const [records, uses] = await Promise.all([
      this.db.select().from(bookmarks).orderBy(desc(bookmarks.createdAt)),
      this.uses(),
    ])
    return records.map((record) => toBookmark(record, uses.get(record.id) ?? 0))
  }

  async get(id: string): Promise<Bookmark> {
    return this.toBookmark(await this.record(id))
  }

  /** These bookmarks, by id (those that exist). */
  async getMany(ids: string[]): Promise<Map<string, Bookmark>> {
    if (!ids.length) return new Map()
    const [records, uses] = await Promise.all([
      this.db.select().from(bookmarks).where(inArray(bookmarks.id, ids)),
      this.uses(ids),
    ])
    return new Map(records.map((r) => [r.id, toBookmark(r, uses.get(r.id) ?? 0)]))
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
    return record ? this.toBookmark(record) : null
  }

  /** A new bookmark. Duplicates are the vault's to look for first (findByUrl). */
  async create(input: BookmarkInput): Promise<Bookmark> {
    const url = webUrl(input.url ?? '') ?? ''
    if (!url) throw new ValidationError('A bookmark needs a web address (http or https)')
    const id = newId()
    const now = this.now()
    await this.db.insert(bookmarks).values({
      id,
      title: clip(input.title ?? '', BOOKMARK_TITLE_MAX) || siteOf(url),
      url,
      urlKey: urlKey(url),
      description: clip(input.description ?? '', BOOKMARK_DESCRIPTION_MAX),
      createdAt: now,
      updatedAt: now,
    })
    return this.get(id)
  }

  async update(id: string, patch: BookmarkPatch): Promise<Bookmark> {
    await this.record(id)
    const changes: Partial<BookmarkRecord> = { updatedAt: this.now() }
    if (patch.title !== undefined) {
      const title = clip(patch.title, BOOKMARK_TITLE_MAX)
      if (!title) throw new ValidationError('The name can’t be empty')
      changes.title = title
    }
    if (patch.url !== undefined) {
      const url = webUrl(patch.url)
      if (!url) throw new ValidationError('A bookmark needs a web address (http or https)')
      changes.url = url
      changes.urlKey = urlKey(url)
    }
    if (patch.description !== undefined) {
      changes.description = clip(patch.description, BOOKMARK_DESCRIPTION_MAX)
    }
    await this.db.update(bookmarks).set(changes).where(eq(bookmarks.id, id))
    return this.get(id)
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

  /** Bookmarks matching a query, best first; with no words, the latest. */
  async search(query: string, limit = 20): Promise<BookmarkSearchResult[]> {
    const parsed = parseQuery(query)
    // Bookmarks have no tags: a tag filter leaves none.
    if (parsed.tags.length) return []
    const all = await this.list()
    // `in:Folder`: a note showing it is in that folder (or is that page).
    const paths = parsed.folders.length ? await this.pathsShowing() : new Map<string, string[]>()
    const candidates = all
      .map((bookmark) => ({ bookmark, fields: fieldsOf(bookmark) }))
      .filter(({ bookmark }) =>
        parsed.folders.every((folder) => {
          const prefix = foldText(folder)
          return (paths.get(bookmark.id) ?? []).some((path) => {
            const folded = foldText(path.replace(/\.md$/, ''))
            return (
              folded === prefix || folded.startsWith(`${prefix}/`) || folded.includes(`/${prefix}`)
            )
          })
        }),
      )

    if (!parsed.words.length && !parsed.phrases.length) {
      return candidates
        .filter(({ fields }) => !parsed.excluded.some((word) => matchIn(fields, word)))
        .slice(0, limit)
        .map(({ bookmark }) => toResult(bookmark, []))
    }

    // Typo tolerance: a word that starts no word of any bookmark is replaced by the closest.
    const vocabulary = new Set(candidates.flatMap(({ fields }) => fields.flatMap((f) => f.words)))
    const words = parsed.words.map((word) =>
      [...vocabulary].some((known) => known.startsWith(word))
        ? word
        : (closest(word, vocabulary) ?? word),
    )

    const scored: { score: number; bookmark: Bookmark }[] = []
    for (const { bookmark, fields } of candidates) {
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
      if (matched) scored.push({ score, bookmark })
    }
    return scored
      .toSorted((a, b) => b.score - a.score || b.bookmark.createdAt - a.bookmark.createdAt)
      .slice(0, limit)
      .map(({ bookmark }) => toResult(bookmark, words))
  }

  private async record(id: string): Promise<BookmarkRecord> {
    const record = await this.db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()
    if (!record) throw new NotFoundError('No such bookmark')
    return record
  }

  private async toBookmark(record: BookmarkRecord): Promise<Bookmark> {
    return toBookmark(record, (await this.uses([record.id])).get(record.id) ?? 0)
  }

  /** How many pages show each bookmark (of `ids`, or all). */
  private async uses(ids?: string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ id: bookmarkRefs.bookmarkId, uses: count() })
      .from(bookmarkRefs)
      .where(ids ? inArray(bookmarkRefs.bookmarkId, ids) : undefined)
      .groupBy(bookmarkRefs.bookmarkId)
    return new Map(rows.map((row) => [row.id, row.uses]))
  }

  /** The paths of the pages showing each bookmark. */
  private async pathsShowing(): Promise<Map<string, string[]>> {
    const rows = await this.db
      .select({ id: bookmarkRefs.bookmarkId, path: nodes.path })
      .from(bookmarkRefs)
      .innerJoin(nodes, eq(nodes.id, bookmarkRefs.nodeId))
    const map = new Map<string, string[]>()
    for (const row of rows) map.set(row.id, [...(map.get(row.id) ?? []), row.path])
    return map
  }
}

function toResult(bookmark: Bookmark, words: string[]): BookmarkSearchResult {
  return { bookmark, titleHtml: markWords(bookmark.title, words) }
}

function toBookmark(record: BookmarkRecord, uses: number): Bookmark {
  return {
    id: record.id,
    title: record.title,
    url: record.url,
    description: record.description,
    icon: record.icon?.startsWith('image:')
      ? `/api/bookmarks/${record.id}/icon?v=${encodeURIComponent(record.icon.slice(6))}`
      : null,
    emoji: record.icon?.startsWith('emoji:') ? record.icon.slice(6) : null,
    uses,
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
