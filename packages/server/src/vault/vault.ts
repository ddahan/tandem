// The vault: every operation on notes, for the API, the MCP server and the file watcher.
//
// Files in the data folder are the source of truth for content and tree shape; the database
// adds identity (ids that survive renames), order, tags, links, history and authorship. Every
// change runs inside one lock, so the web app, agents and the watcher never interleave.
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  DEFAULT_SETTINGS,
  EXTERNAL,
  assetsDirOf,
  childrenDirOf,
  dirnameOf,
  encodeMarkdownPath,
  isImageFile,
  joinPath,
  linkKey,
  parseWikiLinks,
  rewriteWikiLinks,
  sanitizeTitle,
  titleFromPath,
  type Attachment,
  type Backlink,
  type BlameRange,
  type HistoryVersion,
  type NoteDetail,
  type SearchResponse,
  type SearchResult,
  type ServerEvent,
  type Settings,
  type TagCount,
  type TrashItem,
  type TreeNode,
} from '@myfluence/shared'
import type { Database, Db } from '../db/client.ts'
import { links, nodes, settings, tags, trash, versions } from '../db/schema.ts'
import { initialBlame, parseBlame, runsToRanges, updateBlame } from './blame.ts'
import { ConflictError, NotFoundError, ValidationError } from './errors.ts'
import {
  atomicWrite,
  hashContent,
  isIgnoredName,
  moveIfExists,
  removeIfEmpty,
  scanTree,
  statFile,
  uniqueName,
} from './files.ts'
import { Lock } from './lock.ts'
import { SearchIndex, matchesFilters, parseQuery, type Candidate } from './search.ts'
import { markdownToText } from './text.ts'

export type NodeRow = typeof nodes.$inferSelect

export interface VaultOptions {
  dataDir: string
  database: Database
  now?: () => number
  /** A history snapshot is taken after this long without saves. */
  sessionIdleMs?: number
}

interface SaveOptions {
  /** False when the content is already on disk (external edits). */
  write: boolean
}

interface TrashPayload {
  rows: NodeRow[]
  tags: { nodeId: string; tag: string }[]
}

const DAY = 86_400_000

export class Vault {
  readonly events = new EventEmitter<{ event: [ServerEvent] }>()
  readonly dataDir: string
  readonly metaDir: string
  /** True when the database changed since the last backup. */
  dirty = false

  private readonly lock = new Lock()
  private readonly db: Db
  private readonly search: SearchIndex
  private readonly now: () => number
  private readonly sessionIdleMs: number

  constructor(options: VaultOptions) {
    this.dataDir = options.dataDir
    this.metaDir = join(options.dataDir, '.myfluence')
    this.db = options.database.db
    this.search = new SearchIndex(options.database.sqlite)
    this.now = options.now ?? Date.now
    this.sessionIdleMs = options.sessionIdleMs ?? 30_000
  }

  // --- Reading -------------------------------------------------------------------------------

  async tree(): Promise<TreeNode[]> {
    const rows = await this.allRows()
    const owners = ownersByDir(rows)
    return rows.map((row) => toTreeNode(row, owners))
  }

  async getNode(id: string): Promise<TreeNode> {
    const row = await this.requireRow(id)
    return toTreeNode(row, ownersByDir(await this.allRows()))
  }

  async getNote(id: string): Promise<NoteDetail> {
    return this.lock.run(async () => {
      let row = await this.requirePage(id)
      // An external edit the watcher hasn't processed yet: take it now.
      const content = await readFile(this.abs(row.path), 'utf8').catch(() => null)
      if (content === null)
        throw new NotFoundError(`The file of "${titleFromPath(row.path)}" is missing`)
      if (hashContent(content) !== row.hash) {
        row = await this.saveInternal(row, content, EXTERNAL, { write: false })
      }
      return {
        node: toTreeNode(row, ownersByDir(await this.allRows())),
        content,
        hash: row.hash ?? hashContent(content),
        tags: await this.tagsOf(row.id),
        attachments: await this.listAttachments(row),
        lastAuthor: row.lastAuthor,
      }
    })
  }

  /**
   * Finds a node from what an agent typed: an id, a path (with or without `.md`) or a title
   * (case-insensitive). Ambiguous titles are an error listing the matching paths.
   */
  async resolveRef(ref: string): Promise<TreeNode> {
    const rows = await this.allRows()
    const owners = ownersByDir(rows)
    const trimmed = ref.trim().replace(/^\/+/, '')
    const byId = rows.find((row) => row.id === trimmed)
    if (byId) return toTreeNode(byId, owners)
    const lower = trimmed.toLowerCase()
    const byPath = rows.find(
      (row) => row.path.toLowerCase() === lower || row.path.toLowerCase() === `${lower}.md`,
    )
    if (byPath) return toTreeNode(byPath, owners)
    const byTitle = rows.filter((row) => titleFromPath(row.path).toLowerCase() === lower)
    const pages = byTitle.filter((row) => row.kind === 'page')
    const candidates = pages.length ? pages : byTitle
    if (candidates.length === 1) return toTreeNode(candidates[0]!, owners)
    if (candidates.length > 1) {
      throw new ValidationError(
        `"${ref}" is ambiguous; use one of: ${candidates.map((row) => row.path).join(', ')}`,
      )
    }
    throw new NotFoundError(`No note or folder matches "${ref}"`)
  }

  /** The page a wiki link points to: by path first, then by title (shortest path wins). */
  async resolveLink(target: string): Promise<TreeNode | null> {
    const key = linkKey(target)
    const rows = await this.allRows()
    const pages = rows.filter((row) => row.kind === 'page')
    const match =
      pages.find((row) => linkKey(row.path) === key) ??
      pages
        .filter((row) => linkKey(titleFromPath(row.path)) === key)
        .toSorted((a, b) => a.path.length - b.path.length)[0]
    return match ? toTreeNode(match, ownersByDir(rows)) : null
  }

  async backlinks(id: string): Promise<Backlink[]> {
    const row = await this.requirePage(id)
    const keys = [linkKey(titleFromPath(row.path)), linkKey(row.path)]
    const sources = await this.db
      .selectDistinct({ id: nodes.id, path: nodes.path })
      .from(links)
      .innerJoin(nodes, eq(nodes.id, links.sourceId))
      .where(inArray(links.target, keys))
    return sources
      .filter((source) => source.id !== id)
      .map((source) => ({ id: source.id, path: source.path, title: titleFromPath(source.path) }))
      .toSorted((a, b) => a.title.localeCompare(b.title))
  }

  async listTags(): Promise<TagCount[]> {
    const rows = await this.db.select({ tag: tags.tag }).from(tags)
    const counts = new Map<string, number>()
    for (const { tag } of rows) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .toSorted((a, b) => a.tag.localeCompare(b.tag))
  }

  async searchNotes(query: string, limit = 30): Promise<SearchResponse> {
    const rows = await this.allRows()
    const pages = new Map(rows.filter((row) => row.kind === 'page').map((row) => [row.id, row]))
    const owners = ownersByDir(rows)

    const tagRows = await this.db.select().from(tags)
    const tagsById = new Map<string, string[]>()
    for (const { nodeId, tag } of tagRows)
      tagsById.set(nodeId, [...(tagsById.get(nodeId) ?? []), tag])

    // No words to search (empty, or only `tag:` / `in:` filters): recent notes, filtered.
    const parsed = parseQuery(query)
    if (!parsed.words.length && !parsed.phrases.length) {
      const recent = [...pages.values()]
        .filter((row) =>
          matchesFilters(
            {
              path: row.path,
              tags: tagsById.get(row.id) ?? [],
              attachments: [],
              updatedAt: row.updatedAt,
            },
            parsed,
          ),
        )
        .toSorted((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
      return {
        correctedQuery: null,
        results: recent.map((row) =>
          searchResult(toTreeNode(row, owners), '', [], tagsById.get(row.id) ?? []),
        ),
      }
    }

    const response = this.search.search(query, {
      limit,
      now: this.now(),
      candidates: (ids) => {
        const result = new Map<string, Candidate>()
        const attachments = this.search.attachmentsOf(ids)
        for (const id of ids) {
          const row = pages.get(id)
          if (!row) continue
          result.set(id, {
            path: row.path,
            tags: tagsById.get(id) ?? [],
            attachments: attachments.get(id) ?? [],
            updatedAt: row.updatedAt,
          })
        }
        return result
      },
    })

    return {
      correctedQuery: response.correctedQuery,
      results: response.ids.map((id) =>
        searchResult(
          toTreeNode(pages.get(id)!, owners),
          response.snippets.get(id) ?? '',
          response.matchedAttachments.get(id) ?? [],
          tagsById.get(id) ?? [],
        ),
      ),
    }
  }

  async blame(id: string): Promise<BlameRange[]> {
    const row = await this.requirePage(id)
    return runsToRanges(parseBlame(row.blame) ?? [])
  }

  async history(id: string): Promise<HistoryVersion[]> {
    await this.requirePage(id)
    const rows = await this.db
      .select()
      .from(versions)
      .where(eq(versions.nodeId, id))
      .orderBy(desc(versions.createdAt))
    return rows.map(({ id: versionId, nodeId, createdAt, author, size }) => ({
      id: versionId,
      noteId: nodeId,
      createdAt,
      author,
      size,
    }))
  }

  async readVersion(versionId: string): Promise<{ version: HistoryVersion; content: string }> {
    const row = await this.db.select().from(versions).where(eq(versions.id, versionId)).get()
    if (!row) throw new NotFoundError('Version not found')
    const content = await readFile(join(this.metaDir, 'history', row.file), 'utf8')
    return {
      version: {
        id: row.id,
        noteId: row.nodeId,
        createdAt: row.createdAt,
        author: row.author,
        size: row.size,
      },
      content,
    }
  }

  async attachments(id: string): Promise<Attachment[]> {
    return this.listAttachments(await this.requirePage(id))
  }

  async trashList(): Promise<TrashItem[]> {
    const rows = await this.db.select().from(trash).orderBy(desc(trash.deletedAt))
    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as TrashPayload
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        originalPath: row.originalPath,
        deletedAt: row.deletedAt,
        pageCount: payload.rows.filter((r) => r.kind === 'page').length,
      }
    })
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.db.select().from(settings)
    const stored = Object.fromEntries(
      rows.map((row) => [row.key, JSON.parse(row.value) as unknown]),
    )
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  // --- Changing ------------------------------------------------------------------------------

  async createPage(input: {
    parentId?: string | null
    title: string
    content?: string
    author: string
    tags?: string[]
  }): Promise<TreeNode> {
    return this.lock.run(async () => {
      const dir = await this.dirOfParent(input.parentId ?? null)
      const name = uniqueName(sanitizeTitle(input.title), '', await this.takenNames(dir))
      const path = joinPath(dir, `${name}.md`)
      const content = input.content ?? ''
      const now = this.now()
      await atomicWrite(this.abs(path), content)
      const info = await statFile(this.abs(path))
      const row: NodeRow = {
        id: nanoid(12),
        kind: 'page',
        path,
        position: await this.nextPosition(dir),
        createdAt: now,
        updatedAt: now,
        content,
        hash: hashContent(content),
        mtime: info?.mtime ?? null,
        size: info?.size ?? null,
        lastAuthor: input.author,
        lastSaveAt: now,
        pendingSnapshot: content !== '',
        blame: JSON.stringify(initialBlame(content, input.author, now)),
      }
      await this.db.insert(nodes).values(row)
      if (input.tags?.length) await this.writeTags(row.id, input.tags)
      await this.indexPage(row)
      this.changed({ type: 'tree' })
      return this.nodeOf(row)
    })
  }

  async createFolder(input: { parentId?: string | null; title: string }): Promise<TreeNode> {
    return this.lock.run(async () => {
      const dir = await this.dirOfParent(input.parentId ?? null)
      const name = uniqueName(sanitizeTitle(input.title), '', await this.takenNames(dir))
      const path = joinPath(dir, name)
      await mkdir(this.abs(path), { recursive: true })
      const now = this.now()
      const row = await this.insertFolder(path, now)
      this.changed({ type: 'tree' })
      return this.nodeOf(row)
    })
  }

  /**
   * Saves a page's content. With `baseHash` (the hash the editor started from), a page changed
   * by someone else in the meantime is a conflict, returned with the current content.
   */
  async saveContent(
    id: string,
    content: string,
    options: { author: string; baseHash?: string },
  ): Promise<{ hash: string; updatedAt: number }> {
    return this.lock.run(async () => {
      let row = await this.requirePage(id)
      const onDisk = await readFile(this.abs(row.path), 'utf8')
      const diskHash = hashContent(onDisk)
      if (diskHash !== row.hash)
        row = await this.saveInternal(row, onDisk, EXTERNAL, { write: false })
      if (options.baseHash && options.baseHash !== diskHash) {
        throw new ConflictError('The note changed since it was opened', {
          content: onDisk,
          hash: diskHash,
        })
      }
      if (content !== onDisk)
        row = await this.saveInternal(row, content, options.author, { write: true })
      return { hash: row.hash!, updatedAt: row.updatedAt }
    })
  }

  /** Appends Markdown at the end of a page, as a new block. */
  async appendContent(id: string, text: string, author: string): Promise<{ hash: string }> {
    return this.lock.run(async () => {
      const row = await this.freshPage(id)
      const current = row.content ?? ''
      const separator =
        current === '' ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
      const next = await this.saveInternal(
        row,
        `${current}${separator}${text.replace(/\n*$/, '\n')}`,
        author,
        {
          write: true,
        },
      )
      return { hash: next.hash! }
    })
  }

  /** Replaces exact text in a page; `find` must occur once unless `all` is set. */
  async replaceText(
    id: string,
    find: string,
    replacement: string,
    options: { author: string; all?: boolean },
  ): Promise<{ hash: string; count: number }> {
    return this.lock.run(async () => {
      if (!find) throw new ValidationError('The text to find is empty')
      const row = await this.freshPage(id)
      const current = row.content ?? ''
      const count = current.split(find).length - 1
      if (count === 0) throw new ValidationError('The text to find was not found in the note')
      if (count > 1 && !options.all) {
        throw new ValidationError(
          `The text to find occurs ${count} times; add context to make it unique, or replace all`,
        )
      }
      const next = await this.saveInternal(
        row,
        current.split(find).join(replacement),
        options.author,
        { write: true },
      )
      return { hash: next.hash!, count }
    })
  }

  async rename(id: string, title: string, author: string): Promise<TreeNode> {
    return this.lock.run(async () => {
      const row = await this.requireRow(id)
      const name = sanitizeTitle(title)
      await this.relocate(row, dirnameOf(row.path), name, author)
      this.changed({ type: 'tree' })
      return this.nodeOf(await this.requireRow(id))
    })
  }

  /** Moves a node under `parentId` (null: the root) at `index` among its new siblings. */
  async move(
    id: string,
    target: { parentId: string | null; index?: number },
    author: string,
  ): Promise<TreeNode> {
    return this.lock.run(async () => {
      const row = await this.requireRow(id)
      const newDir = await this.dirOfParent(target.parentId)
      const base = row.kind === 'page' ? childrenDirOf(row.path) : row.path
      if (newDir === base || newDir.startsWith(`${base}/`)) {
        throw new ValidationError('A note cannot be moved inside itself')
      }
      if (newDir !== dirnameOf(row.path)) {
        await this.relocate(row, newDir, titleFromPath(row.path), author)
      }
      const moved = await this.requireRow(id)
      const siblings = (await this.allRows())
        .filter((r) => dirnameOf(r.path) === newDir && r.id !== id)
        .toSorted(byPosition)
      const index = Math.max(0, Math.min(target.index ?? siblings.length, siblings.length))
      siblings.splice(index, 0, moved)
      for (const [position, sibling] of siblings.entries()) {
        if (sibling.position !== position) {
          await this.db.update(nodes).set({ position }).where(eq(nodes.id, sibling.id))
        }
      }
      this.changed({ type: 'tree' })
      return this.nodeOf(await this.requireRow(id))
    })
  }

  /** Moves a node (with its child pages, attachments and history) to the trash. */
  async remove(id: string): Promise<{ trashId: string }> {
    return this.lock.run(async () => {
      const row = await this.requireRow(id)
      const subtree = await this.subtreeOf(row)
      for (const page of subtree) {
        if (page.kind === 'page' && page.pendingSnapshot) await this.snapshot(page)
      }
      const trashId = nanoid(12)
      const trashRoot = join(this.metaDir, 'trash', trashId)
      const name = titleFromPath(row.path)
      if (row.kind === 'page') {
        await moveIfExists(this.abs(row.path), join(trashRoot, `${name}.md`))
        await moveIfExists(this.abs(childrenDirOf(row.path)), join(trashRoot, name))
        await moveIfExists(this.abs(assetsDirOf(row.path)), join(trashRoot, `${name}.assets`))
      } else {
        await moveIfExists(this.abs(row.path), join(trashRoot, name))
      }
      const ids = subtree.map((r) => r.id)
      const payload: TrashPayload = {
        rows: (await this.db.select().from(nodes).where(inArray(nodes.id, ids))) as NodeRow[],
        tags: await this.db.select().from(tags).where(inArray(tags.nodeId, ids)),
      }
      await this.db.insert(trash).values({
        id: trashId,
        title: name,
        kind: row.kind,
        originalPath: row.path,
        deletedAt: this.now(),
        payload: JSON.stringify(payload),
      })
      await this.db.delete(nodes).where(inArray(nodes.id, ids))
      for (const removed of ids) this.search.remove(removed)
      await this.cleanChildrenDir(dirnameOf(row.path))
      this.changed({ type: 'tree' })
      this.changed({ type: 'trash' })
      return { trashId }
    })
  }

  async restoreFromTrash(trashId: string): Promise<TreeNode> {
    return this.lock.run(async () => {
      const item = await this.db.select().from(trash).where(eq(trash.id, trashId)).get()
      if (!item) throw new NotFoundError('Not in the trash')
      const payload = JSON.parse(item.payload) as TrashPayload
      const trashRoot = join(this.metaDir, 'trash', trashId)
      const dir = dirnameOf(item.originalPath)
      const name = item.title
      const taken = await this.takenNames(dir)
      const finalName = taken.has(name.toLowerCase())
        ? uniqueName(`${name} (restored)`, '', taken)
        : name
      const oldBase = item.kind === 'page' ? childrenDirOf(item.originalPath) : item.originalPath
      const newBase = joinPath(dir, finalName)
      if (item.kind === 'page') {
        await moveIfExists(join(trashRoot, `${name}.md`), this.abs(`${newBase}.md`))
        await moveIfExists(join(trashRoot, name), this.abs(newBase))
        await moveIfExists(join(trashRoot, `${name}.assets`), this.abs(`${newBase}.assets`))
      } else {
        await moveIfExists(join(trashRoot, name), this.abs(newBase))
      }
      const rewrite = (path: string) =>
        path === item.originalPath
          ? item.kind === 'page'
            ? `${newBase}.md`
            : newBase
          : path.startsWith(`${oldBase}/`)
            ? newBase + path.slice(oldBase.length)
            : path
      for (const saved of payload.rows) {
        const restored = { ...saved, path: rewrite(saved.path) }
        await this.db.insert(nodes).values(restored)
        if (restored.kind === 'page') await this.indexPage(restored)
      }
      if (payload.tags.length) await this.db.insert(tags).values(payload.tags)
      await this.db.delete(trash).where(eq(trash.id, trashId))
      await rm(trashRoot, { recursive: true, force: true })
      // The original parent may be gone: its folder now exists again, without a row.
      await this.reconcileInternal()
      this.changed({ type: 'tree' })
      this.changed({ type: 'trash' })
      const id = payload.rows.find((r) => r.path === item.originalPath)?.id
      return this.nodeOf(await this.requireRow(id ?? ''))
    })
  }

  /** Deletes a trash item for good: files, history and metadata. */
  async deleteFromTrash(trashId: string): Promise<void> {
    return this.lock.run(async () => this.deleteTrashItem(trashId))
  }

  async emptyTrash(): Promise<number> {
    return this.lock.run(async () => {
      const items = await this.db.select({ id: trash.id }).from(trash)
      for (const item of items) await this.deleteTrashItem(item.id)
      return items.length
    })
  }

  async setTags(id: string, list: string[]): Promise<string[]> {
    return this.lock.run(async () => {
      await this.requireRow(id)
      await this.writeTags(id, list)
      this.changed({ type: 'tree' })
      return this.tagsOf(id)
    })
  }

  async restoreVersion(id: string, versionId: string, author: string): Promise<{ hash: string }> {
    const { content, version } = await this.readVersion(versionId)
    if (version.noteId !== id) throw new ValidationError('This version belongs to another note')
    return this.lock.run(async () => {
      const row = await this.freshPage(id)
      // The current state goes into history first, so restoring can be undone.
      if (row.pendingSnapshot) await this.snapshot(row)
      const next = await this.saveInternal(await this.requirePage(id), content, author, {
        write: true,
      })
      return { hash: next.hash! }
    })
  }

  async addAttachment(id: string, fileName: string, data: Uint8Array): Promise<Attachment> {
    return this.lock.run(async () => {
      const row = await this.requirePage(id)
      const dir = assetsDirOf(row.path)
      await mkdir(this.abs(dir), { recursive: true })
      const dot = fileName.lastIndexOf('.')
      const base = sanitizeTitle(dot > 0 ? fileName.slice(0, dot) : fileName)
      const extension =
        dot > 0
          ? `.${fileName
              .slice(dot + 1)
              .replace(/[^a-zA-Z0-9]/g, '')
              .toLowerCase()}`
          : ''
      const existing = new Set((await readdir(this.abs(dir))).map((n) => n.toLowerCase()))
      const name = uniqueName(base, extension === '.' ? '' : extension, existing)
      await atomicWrite(this.abs(joinPath(dir, name)), data)
      await this.indexPage(row)
      this.dirty = true
      return toAttachment(row.path, name, data.byteLength)
    })
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return this.lock.run(async () => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        await this.db
          .insert(settings)
          .values({ key, value: JSON.stringify(value) })
          .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
      }
      this.changed({ type: 'settings' })
      return this.getSettings()
    })
  }

  // --- Background work -----------------------------------------------------------------------

  /**
   * Brings the database in line with the files: new, moved, edited and deleted pages and folders.
   * `changedPaths` (from the watcher) only matters for attachments, which a full scan ignores.
   */
  async reconcile(changedPaths: string[] = []): Promise<void> {
    return this.lock.run(async () => {
      await this.reconcileInternal()
      for (const path of changedPaths) {
        const index = path.indexOf('.assets')
        if (index === -1) continue
        const row = await this.db
          .select()
          .from(nodes)
          .where(eq(nodes.path, `${path.slice(0, index)}.md`))
          .get()
        if (row) await this.indexPage(row as NodeRow)
      }
    })
  }

  /** Reindexes every page (at startup: the index may predate a restored backup). */
  async reindexAll(): Promise<void> {
    return this.lock.run(async () => {
      this.search.clear()
      const pages = (await this.allRows()).filter((row) => row.kind === 'page')
      for (const page of pages) await this.indexPage(page)
    })
  }

  /** Snapshots pages whose editing session ended (no save for `sessionIdleMs`). */
  async flushIdleSessions(): Promise<number> {
    return this.lock.run(async () => {
      const limit = this.now() - this.sessionIdleMs
      const pending = (await this.db
        .select()
        .from(nodes)
        .where(eq(nodes.pendingSnapshot, true))) as NodeRow[]
      let count = 0
      for (const row of pending) {
        if ((row.lastSaveAt ?? 0) <= limit) {
          await this.snapshot(row)
          count++
        }
      }
      return count
    })
  }

  /**
   * Thins out old versions: all are kept for 7 days, then the latest of each day for 90 days,
   * then the latest of each week.
   */
  async thinHistory(): Promise<number> {
    return this.lock.run(async () => {
      const now = this.now()
      const rows = await this.db
        .select()
        .from(versions)
        .orderBy(asc(versions.nodeId), desc(versions.createdAt))
      const kept = new Set<string>()
      const removed: typeof rows = []
      for (const row of rows) {
        const age = now - row.createdAt
        if (age < 7 * DAY) continue
        const bucket =
          age < 90 * DAY ? Math.floor(row.createdAt / DAY) : Math.floor(row.createdAt / (7 * DAY))
        const key = `${row.nodeId}:${age < 90 * DAY ? 'd' : 'w'}:${bucket}`
        if (kept.has(key)) removed.push(row)
        else kept.add(key)
      }
      for (const row of removed) {
        await rm(join(this.metaDir, 'history', row.file), { force: true })
        await this.db.delete(versions).where(eq(versions.id, row.id))
      }
      if (removed.length) this.dirty = true
      return removed.length
    })
  }

  // --- Internals -----------------------------------------------------------------------------

  private abs(path: string): string {
    return join(this.dataDir, path)
  }

  private changed(event: ServerEvent): void {
    this.dirty = true
    this.events.emit('event', event)
  }

  private async allRows(): Promise<NodeRow[]> {
    return (await this.db.select().from(nodes)) as NodeRow[]
  }

  private async requireRow(id: string): Promise<NodeRow> {
    const row = await this.db.select().from(nodes).where(eq(nodes.id, id)).get()
    if (!row) throw new NotFoundError('Note not found')
    return row as NodeRow
  }

  private async requirePage(id: string): Promise<NodeRow> {
    const row = await this.requireRow(id)
    if (row.kind !== 'page') throw new ValidationError('This is a folder, not a note')
    return row
  }

  /** The page row, after taking any external edit of its file into account. */
  private async freshPage(id: string): Promise<NodeRow> {
    const row = await this.requirePage(id)
    const onDisk = await readFile(this.abs(row.path), 'utf8')
    if (hashContent(onDisk) === row.hash) return row
    return this.saveInternal(row, onDisk, EXTERNAL, { write: false })
  }

  private async nodeOf(row: NodeRow): Promise<TreeNode> {
    return toTreeNode(row, ownersByDir(await this.allRows()))
  }

  private async tagsOf(id: string): Promise<string[]> {
    const rows = await this.db
      .select({ tag: tags.tag })
      .from(tags)
      .where(eq(tags.nodeId, id))
      .orderBy(asc(tags.tag))
    return rows.map((row) => row.tag)
  }

  private async writeTags(id: string, list: string[]): Promise<void> {
    const clean = [
      ...new Set(
        list.map((tag) => tag.trim().replace(/^#/, '').replace(/\s+/g, '-')).filter(Boolean),
      ),
    ]
    await this.db.delete(tags).where(eq(tags.nodeId, id))
    if (clean.length) await this.db.insert(tags).values(clean.map((tag) => ({ nodeId: id, tag })))
    this.dirty = true
  }

  /** The folder (relative path) where children of `parentId` live. */
  private async dirOfParent(parentId: string | null): Promise<string> {
    if (!parentId) return ''
    const parent = await this.requireRow(parentId)
    return parent.kind === 'page' ? childrenDirOf(parent.path) : parent.path
  }

  /** Names used in `dir`, lowercase, without `.md` / `.assets`: a page and a folder can't share one. */
  private async takenNames(dir: string): Promise<Set<string>> {
    const names = new Set<string>()
    try {
      for (const name of await readdir(this.abs(dir))) {
        if (isIgnoredName(name)) continue
        names.add(name.replace(/\.(md|assets)$/i, '').toLowerCase())
      }
    } catch {
      // The folder doesn't exist yet.
    }
    return names
  }

  private async nextPosition(dir: string): Promise<number> {
    const siblings = (await this.allRows()).filter((row) => dirnameOf(row.path) === dir)
    return siblings.reduce((max, row) => Math.max(max, row.position + 1), 0)
  }

  private async insertFolder(path: string, now: number): Promise<NodeRow> {
    const row: NodeRow = {
      id: nanoid(12),
      kind: 'folder',
      path,
      position: await this.nextPosition(dirnameOf(path)),
      createdAt: now,
      updatedAt: now,
      content: null,
      hash: null,
      mtime: null,
      size: null,
      lastAuthor: null,
      lastSaveAt: null,
      pendingSnapshot: false,
      blame: null,
    }
    await this.db.insert(nodes).values(row)
    return row
  }

  /** The node and everything below it (child pages, folders). */
  private async subtreeOf(row: NodeRow): Promise<NodeRow[]> {
    const base = row.kind === 'page' ? childrenDirOf(row.path) : row.path
    return (await this.allRows()).filter((r) => r.id === row.id || r.path.startsWith(`${base}/`))
  }

  /**
   * Records a save: history session, authorship, file, index. Snapshots the previous content
   * first when it ends a session (another author, or idle for too long).
   */
  private async saveInternal(
    row: NodeRow,
    content: string,
    author: string,
    options: SaveOptions,
  ): Promise<NodeRow> {
    const now = this.now()
    if (
      row.pendingSnapshot &&
      (row.lastAuthor !== author || now - (row.lastSaveAt ?? 0) >= this.sessionIdleMs)
    ) {
      await this.snapshot(row)
    }
    const blame = updateBlame(row.content ?? '', parseBlame(row.blame), content, author, now)
    if (options.write) await atomicWrite(this.abs(row.path), content)
    const info = await statFile(this.abs(row.path))
    const next: NodeRow = {
      ...row,
      content,
      hash: hashContent(content),
      mtime: info?.mtime ?? null,
      size: info?.size ?? null,
      updatedAt: now,
      lastAuthor: author,
      lastSaveAt: now,
      pendingSnapshot: true,
      blame: JSON.stringify(blame),
    }
    await this.db
      .update(nodes)
      .set({
        content: next.content,
        hash: next.hash,
        mtime: next.mtime,
        size: next.size,
        updatedAt: now,
        lastAuthor: author,
        lastSaveAt: now,
        pendingSnapshot: true,
        blame: next.blame,
      })
      .where(eq(nodes.id, row.id))
    await this.indexPage(next)
    this.changed({ type: 'note', id: row.id, hash: next.hash!, author })
    return next
  }

  /** Writes the page's current content (as last saved) as a history version. */
  private async snapshot(row: NodeRow): Promise<void> {
    const content = row.content ?? ''
    const hash = hashContent(content)
    const latest = await this.db
      .select({ hash: versions.hash })
      .from(versions)
      .where(eq(versions.nodeId, row.id))
      .orderBy(desc(versions.createdAt))
      .get()
    if (content !== '' && latest?.hash !== hash) {
      const createdAt = row.lastSaveAt ?? this.now()
      const id = nanoid(12)
      const stamp = new Date(createdAt)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z')
      const file = `${row.id}/${stamp}-${id}.md`
      await atomicWrite(join(this.metaDir, 'history', file), content)
      await this.db.insert(versions).values({
        id,
        nodeId: row.id,
        createdAt,
        author: row.lastAuthor ?? EXTERNAL,
        file,
        hash,
        size: Buffer.byteLength(content),
      })
    }
    await this.db.update(nodes).set({ pendingSnapshot: false }).where(eq(nodes.id, row.id))
    this.dirty = true
  }

  private async indexPage(row: NodeRow): Promise<void> {
    const content = row.content ?? ''
    const attachments = (await this.listAttachments(row)).map((a) => a.name)
    this.search.index(row.id, titleFromPath(row.path), markdownToText(content), attachments)
    const targets = [...new Set(parseWikiLinks(content).map((link) => linkKey(link.target)))]
    await this.db.delete(links).where(eq(links.sourceId, row.id))
    if (targets.length)
      await this.db.insert(links).values(targets.map((target) => ({ sourceId: row.id, target })))
  }

  private async listAttachments(row: NodeRow): Promise<Attachment[]> {
    const dir = this.abs(assetsDirOf(row.path))
    let names: string[]
    try {
      names = (await readdir(dir)).filter((name) => !isIgnoredName(name))
    } catch {
      return []
    }
    const result: Attachment[] = []
    for (const name of names.toSorted((a, b) => a.localeCompare(b))) {
      const info = await stat(join(dir, name)).catch(() => null)
      if (info?.isFile()) result.push(toAttachment(row.path, name, info.size))
    }
    return result
  }

  /**
   * Renames and/or moves a node to `newDir/newName`, with its child pages and attachments, then
   * fixes what pointed to the old place: the note's own attachment links and wiki links in
   * other notes.
   */
  private async relocate(
    row: NodeRow,
    newDir: string,
    newName: string,
    author: string,
  ): Promise<void> {
    const isPage = row.kind === 'page'
    const oldBase = isPage ? childrenDirOf(row.path) : row.path
    const newBase = joinPath(newDir, newName)
    if (oldBase === newBase) return
    const caseOnly = oldBase.toLowerCase() === newBase.toLowerCase()
    if (!caseOnly && (await this.takenNames(newDir)).has(newName.toLowerCase())) {
      throw new ConflictError(`"${newName}" already exists there`)
    }

    const moves: [string, string][] = isPage
      ? [
          [`${oldBase}.md`, `${newBase}.md`],
          [oldBase, newBase],
          [`${oldBase}.assets`, `${newBase}.assets`],
        ]
      : [[oldBase, newBase]]
    for (const [from, to] of moves) {
      if (caseOnly && existsSync(this.abs(from))) {
        // Case-insensitive file systems (macOS) need two steps for a case-only rename.
        const temporary = `${to}.${nanoid(6)}.myfluence-tmp`
        await rename(this.abs(from), this.abs(temporary))
        await rename(this.abs(temporary), this.abs(to))
      } else {
        await moveIfExists(this.abs(from), this.abs(to))
      }
    }

    const movedPages: { id: string; oldPath: string; newPath: string }[] = []
    for (const r of await this.allRows()) {
      let newPath: string | null = null
      if (r.id === row.id) newPath = isPage ? `${newBase}.md` : newBase
      else if (r.path.startsWith(`${oldBase}/`)) newPath = newBase + r.path.slice(oldBase.length)
      if (newPath === null) continue
      await this.db.update(nodes).set({ path: newPath }).where(eq(nodes.id, r.id))
      if (r.kind === 'page') {
        movedPages.push({ id: r.id, oldPath: r.path, newPath })
        const info = await statFile(this.abs(newPath))
        if (info)
          await this.db
            .update(nodes)
            .set({ mtime: info.mtime, size: info.size })
            .where(eq(nodes.id, r.id))
      }
    }
    await this.cleanChildrenDir(dirnameOf(row.path))

    const oldTitle = titleFromPath(row.path)
    const titleChanged = oldTitle !== newName

    // The page's own attachment links follow its new attachments folder name.
    if (isPage && titleChanged) {
      const page = await this.requirePage(row.id)
      const content = rewriteAssetLinks(page.content ?? '', oldTitle, newName)
      if (content !== page.content) await this.saveInternal(page, content, author, { write: true })
    }

    // Wiki links pointing to moved pages, by path or (for the renamed page) by title.
    const rewrites: [string, string][] = movedPages.map((p) => [
      p.oldPath.replace(/\.md$/, ''),
      p.newPath.replace(/\.md$/, ''),
    ])
    if (isPage && titleChanged) rewrites.push([oldTitle, newName])
    const keys = [...new Set(rewrites.map(([from]) => linkKey(from)))]
    if (keys.length === 0) return
    const sources = await this.db
      .selectDistinct({ id: links.sourceId })
      .from(links)
      .where(inArray(links.target, keys))
    for (const { id } of sources) {
      const source = await this.requirePage(id)
      let content = source.content ?? ''
      for (const [from, to] of rewrites) content = rewriteWikiLinks(content, from, to)
      if (content !== source.content)
        await this.saveInternal(source, content, author, { write: true })
    }
    // Reindex moved pages: titles and paths changed.
    for (const page of movedPages) await this.indexPage(await this.requirePage(page.id))
  }

  /** Removes a page's children folder when its last child left it. */
  private async cleanChildrenDir(dir: string): Promise<void> {
    if (!dir) return
    const owner = await this.db
      .select()
      .from(nodes)
      .where(eq(nodes.path, `${dir}.md`))
      .get()
    if (owner) await removeIfEmpty(this.abs(dir))
  }

  private async deleteTrashItem(trashId: string): Promise<void> {
    const item = await this.db.select().from(trash).where(eq(trash.id, trashId)).get()
    if (!item) throw new NotFoundError('Not in the trash')
    const payload = JSON.parse(item.payload) as TrashPayload
    await rm(join(this.metaDir, 'trash', trashId), { recursive: true, force: true })
    for (const row of payload.rows) {
      await rm(join(this.metaDir, 'history', row.id), { recursive: true, force: true })
      await this.db.delete(versions).where(eq(versions.nodeId, row.id))
    }
    await this.db.delete(trash).where(eq(trash.id, trashId))
    this.changed({ type: 'trash' })
  }

  private async reconcileInternal(): Promise<void> {
    const scan = await scanTree(this.dataDir)
    let rows = await this.allRows()
    let treeChanged = false
    const now = this.now()

    // Pages that disappeared, and files that appeared: a pair with the same content is a move.
    const gone = rows.filter((row) => row.kind === 'page' && !scan.pages.has(row.path))
    const known = new Set(rows.map((row) => row.path))
    for (const page of scan.pages.values()) {
      if (known.has(page.path)) continue
      const content = await readFile(this.abs(page.path), 'utf8').catch(() => null)
      if (content === null) continue
      const hash = hashContent(content)
      const title = titleFromPath(page.path)
      const match =
        gone.find((row) => row.hash === hash && titleFromPath(row.path) === title) ??
        gone.find((row) => row.hash === hash)
      if (match) {
        gone.splice(gone.indexOf(match), 1)
        await this.db
          .update(nodes)
          .set({ path: page.path, mtime: page.mtime, size: page.size })
          .where(eq(nodes.id, match.id))
        await this.indexPage({ ...match, path: page.path })
      } else {
        const row: NodeRow = {
          id: nanoid(12),
          kind: 'page',
          path: page.path,
          position: await this.nextPosition(dirnameOf(page.path)),
          createdAt: Math.round(page.mtime),
          updatedAt: Math.round(page.mtime),
          content,
          hash,
          mtime: page.mtime,
          size: page.size,
          lastAuthor: EXTERNAL,
          lastSaveAt: now,
          pendingSnapshot: content !== '',
          blame: JSON.stringify(initialBlame(content, EXTERNAL, Math.round(page.mtime))),
        }
        await this.db.insert(nodes).values(row)
        await this.indexPage(row)
      }
      treeChanged = true
    }
    for (const row of gone) {
      await this.db.delete(nodes).where(eq(nodes.id, row.id))
      this.search.remove(row.id)
      treeChanged = true
    }

    // Pages edited outside the app.
    rows = await this.allRows()
    for (const row of rows) {
      if (row.kind !== 'page') continue
      const info = scan.pages.get(row.path)
      if (!info || (info.mtime === row.mtime && info.size === row.size)) continue
      const content = await readFile(this.abs(row.path), 'utf8').catch(() => null)
      if (content === null) continue
      if (hashContent(content) !== row.hash) {
        await this.saveInternal(row, content, EXTERNAL, { write: false })
      } else {
        await this.db
          .update(nodes)
          .set({ mtime: info.mtime, size: info.size })
          .where(eq(nodes.id, row.id))
      }
    }

    // Folders: every folder without a same-named page.
    const expected = new Set([...scan.dirs].filter((dir) => !scan.pages.has(`${dir}.md`)))
    for (const row of rows) {
      if (row.kind !== 'folder') continue
      if (expected.has(row.path)) expected.delete(row.path)
      else {
        await this.db.delete(nodes).where(eq(nodes.id, row.id))
        treeChanged = true
      }
    }
    for (const dir of [...expected].toSorted()) {
      await this.insertFolder(dir, now)
      treeChanged = true
    }

    if (treeChanged) this.changed({ type: 'tree' })
  }
}

// --- Helpers -------------------------------------------------------------------------------

function byPosition(a: NodeRow, b: NodeRow): number {
  return a.position - b.position || titleFromPath(a.path).localeCompare(titleFromPath(b.path))
}

/** Which node owns each folder: a page owns its children folder; a folder row owns itself. */
function ownersByDir(rows: NodeRow[]): Map<string, NodeRow> {
  const owners = new Map<string, NodeRow>()
  for (const row of rows) owners.set(row.kind === 'page' ? childrenDirOf(row.path) : row.path, row)
  return owners
}

function toTreeNode(row: NodeRow, owners: Map<string, NodeRow>): TreeNode {
  return {
    id: row.id,
    kind: row.kind,
    title: titleFromPath(row.path),
    path: row.path,
    parentId: owners.get(dirnameOf(row.path))?.id ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function searchResult(
  node: TreeNode,
  snippet: string,
  attachments: string[],
  tagList: string[],
): SearchResult {
  return {
    id: node.id,
    title: node.title,
    path: node.path,
    updatedAt: node.updatedAt,
    snippet,
    attachments,
    tags: tagList,
  }
}

function toAttachment(pagePath: string, name: string, size: number): Attachment {
  return {
    name,
    markdownPath: encodeMarkdownPath(`${titleFromPath(pagePath)}.assets/${name}`),
    path: joinPath(assetsDirOf(pagePath), name),
    size,
    isImage: isImageFile(name),
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `](Old.assets/…`, `src="Old.assets/…` (encoded or not) → the new attachments folder. */
export function rewriteAssetLinks(content: string, oldTitle: string, newTitle: string): string {
  const forms = [...new Set([oldTitle, encodeMarkdownPath(oldTitle)])]
  let result = content
  for (const form of forms) {
    const pattern = new RegExp(`([(<"'])(?:\\./)?${escapeRegExp(`${form}.assets/`)}`, 'g')
    result = result.replace(pattern, `$1${encodeMarkdownPath(newTitle)}.assets/`)
  }
  return result
}
