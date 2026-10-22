// MCP server (Streamable HTTP, stateless) at `/mcp`, so agents can read and write notes:
//   claude mcp add --transport http tandem http://localhost:3864/mcp \
//     --header "X-Tandem-Author: claude"
// The author header names the agent in history and authorship (default: `agent`).
import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  COLUMN_TYPES,
  DEFAULT_AGENT,
  bookmarkBlock,
  bookmarkIdsIn,
  cellsByName,
  databaseBlock,
  databaseIdsIn,
  formatDateTime,
  isoDate,
  normalizeAuthor,
  rowsByName,
  type Bookmark,
  type Database,
  type TreeNode,
} from '@tandem/shared'
import type { Vault } from '../vault/vault.ts'
import { AUTHOR_HEADER } from './index.ts'

const INSTRUCTIONS = `Tandem is the user's note-taking app. Notes are Markdown pages in a tree
(a page can have child pages; one with child pages and no content is shown as a folder, and
writing in it makes it a page), with tags, history and per-line authorship. Notes are referenced by
id, path ("Projects/Roadmap") or title. Links between notes are written [[Title]] or
[[Folder/Title]]. Prefer small edits (append_to_note, replace_in_note) over rewriting whole notes,
so that the user's lines keep their authorship. Never delete notes unless the user asked.
Databases (tables of rows with typed columns, sortable and filterable) live in Tandem, not in the
Markdown: a note only has a \`\`\`database block naming one. Use the database tools for them.
Each day can have a daily note (Calendar/YYYY-MM-DD): daily_note reads, creates or appends to it.
Bookmarks (links to websites, in folders) also live in Tandem: a note shows one as a card with a
\`\`\`bookmark block naming it (id: …). Use the bookmark tools for them; add_bookmark can put
its card in a note.`

type Text = { content: { type: 'text'; text: string }[]; isError?: boolean }

function text(value: string): Text {
  return { content: [{ type: 'text', text: value }] }
}

function json(value: unknown): Text {
  return text(JSON.stringify(value, null, 2))
}

/** Tool errors are returned to the agent (with the message) instead of failing the call. */
async function attempt(task: () => Promise<Text>): Promise<Text> {
  try {
    return await task()
  } catch (error) {
    return { ...text(error instanceof Error ? error.message : String(error)), isError: true }
  }
}

function describeTree(nodes: TreeNode[]): string {
  const children = new Map<string | null, TreeNode[]>()
  for (const node of nodes)
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const lines: string[] = []
  const walk = (parentId: string | null, depth: number) => {
    const list = (children.get(parentId) ?? []).toSorted((a, b) => a.position - b.position)
    for (const node of list) {
      lines.push(
        `${'  '.repeat(depth)}- ${node.kind === 'folder' ? '📁 ' : ''}${node.title}  (${node.path}, id ${node.id})`,
      )
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines.join('\n') || '(no notes yet)'
}

/** Bookmarks and folders as an indented list, with ids and addresses. */
function describeBookmarks(all: Bookmark[]): string {
  const lines: string[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const bookmark of all.filter((b) => b.parentId === parentId)) {
      lines.push(
        bookmark.kind === 'folder'
          ? `${'  '.repeat(depth)}- 📁 ${bookmark.title}  (id ${bookmark.id})`
          : `${'  '.repeat(depth)}- ${bookmark.title} <${bookmark.url}>  (id ${bookmark.id})${bookmark.description ? ` — ${bookmark.description}` : ''}`,
      )
      walk(bookmark.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines.join('\n') || '(no bookmarks yet)'
}

/** A database's columns for agents (choices of `select` columns). */
function describeColumns(database: Database) {
  return database.columns.map((c) => ({
    name: c.name,
    type: c.type,
    ...(c.options ? { choices: c.options } : {}),
    ...(c.allowEmpty === false ? { allowEmpty: false } : {}),
  }))
}

export function createMcpServer(vault: Vault, author: string): McpServer {
  /** The bookmarks a note's blocks name (the Markdown only has their ids). */
  const bookmarkLines = async (content: string) => {
    const lines: string[] = []
    for (const id of new Set(bookmarkIdsIn(content))) {
      const bookmark = await vault.getBookmark(id).catch(() => null)
      lines.push(
        bookmark
          ? `bookmark ${id}: ${bookmark.title} <${bookmark.url}>`
          : `bookmark ${id}: deleted`,
      )
    }
    return lines
  }

  const server = new McpServer({ name: 'tandem', version: '1.0.0' }, { instructions: INSTRUCTIONS })
  const ref = z.string().describe('Note id, path (e.g. "Projects/Roadmap") or title')

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Full-text search over titles, text and attachment names. Supports prefixes, "exact phrases", -excluded words, tag:<tag> and in:<folder>. Typos are corrected.',
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(100).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) =>
      attempt(async () => {
        const response = await vault.searchNotes(query, limit ?? 20)
        return json({
          correctedQuery: response.correctedQuery,
          results: response.results.map((r) => ({
            id: r.id,
            title: r.title,
            path: r.path,
            tags: r.tags,
            updated: formatDateTime(r.updatedAt),
            snippet: r.snippet.replace(/<\/?mark>/g, '**'),
            attachments: r.attachments,
          })),
        })
      }),
  )

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description: 'The whole tree of pages and folders, with paths and ids.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => attempt(async () => text(describeTree(await vault.tree()))),
  )

  server.registerTool(
    'read_note',
    {
      title: 'Read a note',
      description: 'The Markdown content of a note, with its tags, attachments and backlinks.',
      inputSchema: { note: ref },
      annotations: { readOnlyHint: true },
    },
    async ({ note }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        const detail = await vault.getNote(node.id)
        const backlinks = await vault.backlinks(node.id)
        const header = [
          `# ${node.title}`,
          `path: ${node.path} · id: ${node.id} · updated: ${formatDateTime(node.updatedAt)}`,
          detail.tags.length ? `tags: ${detail.tags.join(', ')}` : null,
          detail.attachments.length
            ? `attachments: ${detail.attachments.map((a) => a.markdownPath).join(', ')}`
            : null,
          backlinks.length ? `linked from: ${backlinks.map((b) => b.path).join(', ')}` : null,
          ...(await bookmarkLines(detail.content)),
        ]
          .filter(Boolean)
          .join('\n')
        return text(`${header}\n\n---\n\n${detail.content}`)
      }),
  )

  server.registerTool(
    'create_note',
    {
      title: 'Create a note',
      description:
        'Creates a page (optionally under a parent page). Returns its id and path. A page without content but with child pages is a folder: there is nothing else to create.',
      inputSchema: {
        title: z.string(),
        content: z.string().optional().describe('Markdown (GFM)'),
        parent: ref.optional().describe('Parent page; omit for the root'),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ title, content, parent, tags }) =>
      attempt(async () => {
        const parentId = parent ? (await vault.resolveRef(parent)).id : null
        return json(await vault.createPage({ title, content, parentId, tags, author }))
      }),
  )

  server.registerTool(
    'append_to_note',
    {
      title: 'Append to a note',
      description: 'Adds Markdown at the end of a note, as a new block.',
      inputSchema: { note: ref, content: z.string() },
    },
    async ({ note, content }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        await vault.appendContent(node.id, content, author)
        return text(`Appended to ${node.path}`)
      }),
  )

  server.registerTool(
    'daily_note',
    {
      title: 'Daily note',
      description:
        "A day's note (Calendar/YYYY-MM-DD; today, on the user's computer, by default), created when it has none: its content, and `append` added at its end as a new block.",
      inputSchema: {
        date: z.string().optional().describe('The day, YYYY-MM-DD (default: today)'),
        append: z.string().optional().describe('Markdown to add at the end'),
      },
    },
    async ({ date, append }) =>
      attempt(async () => {
        const node = await vault.calendarNote(date ?? isoDate(), author)
        if (append) await vault.appendContent(node.id, append, author)
        const detail = await vault.getNote(node.id)
        return text(
          `# ${node.title}\npath: ${node.path} · id: ${node.id}\n\n---\n\n${detail.content}`,
        )
      }),
  )

  server.registerTool(
    'replace_in_note',
    {
      title: 'Edit a note',
      description:
        'Replaces exact text in a note. `find` must occur exactly once (add surrounding context) unless `all` is true.',
      inputSchema: {
        note: ref,
        find: z.string(),
        replace: z.string(),
        all: z.boolean().optional(),
      },
    },
    async ({ note, find, replace, all }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        const { count } = await vault.replaceText(node.id, find, replace, { author, all })
        return text(`Replaced ${count} occurrence(s) in ${node.path}`)
      }),
  )

  server.registerTool(
    'write_note',
    {
      title: 'Rewrite a note',
      description:
        'Replaces the whole content of a note. Prefer replace_in_note for small changes.',
      inputSchema: { note: ref, content: z.string() },
    },
    async ({ note, content }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        await vault.saveContent(node.id, content, { author })
        return text(`Saved ${node.path}`)
      }),
  )

  server.registerTool(
    'rename_note',
    {
      title: 'Rename a note',
      description: 'Renames a page or folder; links to it are updated.',
      inputSchema: { note: ref, title: z.string() },
    },
    async ({ note, title }) =>
      attempt(async () =>
        json(await vault.rename((await vault.resolveRef(note)).id, title, author)),
      ),
  )

  server.registerTool(
    'move_note',
    {
      title: 'Move a note',
      description:
        'Moves a page or folder under another page or folder (or the root); links are updated.',
      inputSchema: { note: ref, parent: ref.optional().describe('Omit to move to the root') },
    },
    async ({ note, parent }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        const parentId = parent ? (await vault.resolveRef(parent)).id : null
        return json(await vault.move(node.id, { parentId }, author))
      }),
  )

  server.registerTool(
    'delete_note',
    {
      title: 'Delete a note',
      description:
        'Moves a page (with its child pages) or folder to the trash. Only when the user asked.',
      inputSchema: { note: ref },
      annotations: { destructiveHint: true },
    },
    async ({ note }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        await vault.remove(node.id)
        return text(`Moved ${node.path} to the trash`)
      }),
  )

  server.registerTool(
    'set_tags',
    {
      title: 'Set tags',
      description: 'Replaces the tags of a note.',
      inputSchema: { note: ref, tags: z.array(z.string()) },
    },
    async ({ note, tags }) =>
      attempt(async () => json(await vault.setTags((await vault.resolveRef(note)).id, tags))),
  )

  server.registerTool(
    'set_icon',
    {
      title: 'Set an icon',
      description:
        'Sets an emoji as the icon of a page or folder, shown in the tree. Omit emoji to remove it.',
      inputSchema: { note: ref, emoji: z.string().optional() },
    },
    async ({ note, emoji }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        return json(
          emoji ? await vault.setIconEmoji(node.id, emoji) : await vault.clearIcon(node.id),
        )
      }),
  )

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'All tags with their number of notes.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => attempt(async () => json(await vault.listTags())),
  )

  server.registerTool(
    'note_history',
    {
      title: 'Note history',
      description: 'Versions of a note (newest first), with authors. Read one with read_version.',
      inputSchema: { note: ref },
      annotations: { readOnlyHint: true },
    },
    async ({ note }) =>
      attempt(async () => {
        const versions = await vault.history((await vault.resolveRef(note)).id)
        return json(
          versions.map((v) => ({
            id: v.id,
            date: formatDateTime(v.createdAt),
            author: v.author,
            size: v.size,
          })),
        )
      }),
  )

  server.registerTool(
    'read_version',
    {
      title: 'Read a version',
      description: 'The content of a past version of a note.',
      inputSchema: { versionId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ versionId }) =>
      attempt(async () => text((await vault.readVersion(versionId)).content)),
  )

  server.registerTool(
    'attach_file',
    {
      title: 'Attach a file',
      description:
        "Stores a file (base64) in the note's attachments folder and returns the Markdown to reference it. Set insert to append that Markdown to the note.",
      inputSchema: {
        note: ref,
        fileName: z.string(),
        base64: z.string(),
        insert: z.boolean().optional(),
      },
    },
    async ({ note, fileName, base64, insert }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        const attachment = await vault.addAttachment(
          node.id,
          fileName,
          Buffer.from(base64, 'base64'),
        )
        const markdown = attachment.isImage
          ? `![${attachment.name}](${attachment.markdownPath})`
          : `[${attachment.name}](${attachment.markdownPath})`
        if (insert) await vault.appendContent(node.id, markdown, author)
        return text(markdown)
      }),
  )

  // --- Databases -------------------------------------------------------------------------------

  const database = z.string().describe('Database id (from list_databases)')
  const values = z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .describe(
      'Values by column name. Dates as 2026-10-17 (or 17/10/2026), checkboxes true/false, choices by name, null to empty a cell.',
    )

  server.registerTool(
    'list_databases',
    {
      title: 'List the databases of a note',
      description:
        'The databases a note shows (its database blocks, in order), with their columns.',
      inputSchema: { note: ref },
      annotations: { readOnlyHint: true },
    },
    async ({ note }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        const { content } = await vault.getNote(node.id)
        const list = []
        for (const id of databaseIdsIn(content)) {
          const d = await vault.getDatabase(id).catch(() => null)
          if (d) list.push({ id, title: d.title, columns: describeColumns(d), rows: d.rows.length })
        }
        return json(list)
      }),
  )

  server.registerTool(
    'read_database',
    {
      title: 'Read a database',
      description:
        "Its columns and rows (with their ids, values by column name), as the user's saved view shows them (sorted, filtered); all: true for every row in table order.",
      inputSchema: { database, all: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ database: id, all }) =>
      attempt(async () => {
        const d = await vault.getDatabase(id)
        return json({
          id: d.id,
          title: d.title,
          columns: describeColumns(d),
          rows: rowsByName(d, all ?? false),
          ...(all ? {} : { hiddenByFilters: d.rows.length - rowsByName(d).length }),
        })
      }),
  )

  server.registerTool(
    'create_database',
    {
      title: 'Create a database',
      description:
        'Creates a database in a note (its block is added at the end of the note), with columns and optional first rows. Returns its id.',
      inputSchema: {
        note: ref,
        title: z.string(),
        columns: z
          .array(
            z.object({
              name: z.string(),
              type: z.enum(COLUMN_TYPES),
              choices: z.array(z.string()).optional().describe('For select columns'),
              allowEmpty: z
                .boolean()
                .optional()
                .describe(
                  'Select columns: false to require a value (new rows get the first choice). Default true.',
                ),
            }),
          )
          .min(1),
        rows: z.array(values).optional(),
      },
    },
    async ({ note, title, columns, rows }) =>
      attempt(async () => {
        const node = await vault.resolveRef(note)
        let d = await vault.createDatabase(node.id, {
          title,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type,
            options: c.choices,
            allowEmpty: c.allowEmpty,
          })),
        })
        const [first, ...others] = rows ?? []
        if (first) d = await vault.updateDatabaseRow(d.id, d.rows[0]!.id, cellsByName(d, first))
        for (const row of others)
          d = await vault.addDatabaseRow(d.id, { cells: cellsByName(d, row) })
        await vault.appendContent(node.id, databaseBlock(d.id), author)
        return json({ id: d.id, rows: d.rows.length })
      }),
  )

  server.registerTool(
    'add_database_rows',
    {
      title: 'Add rows to a database',
      description: 'Adds rows at the end. Returns their ids.',
      inputSchema: { database, rows: z.array(values).min(1) },
    },
    async ({ database: id, rows }) =>
      attempt(async () => {
        let d = await vault.getDatabase(id)
        const before = new Set(d.rows.map((row) => row.id))
        for (const row of rows) d = await vault.addDatabaseRow(id, { cells: cellsByName(d, row) })
        return json({ added: d.rows.filter((row) => !before.has(row.id)).map((row) => row.id) })
      }),
  )

  server.registerTool(
    'update_database_row',
    {
      title: 'Change a row of a database',
      description: 'Sets some values of a row (the others are kept).',
      inputSchema: { database, row: z.string().describe('Row id (from read_database)'), values },
    },
    async ({ database: id, row, values: given }) =>
      attempt(async () => {
        const d = await vault.getDatabase(id)
        await vault.updateDatabaseRow(id, row, cellsByName(d, given))
        return text('Saved')
      }),
  )

  server.registerTool(
    'delete_database_row',
    {
      title: 'Delete a row of a database',
      description: 'Deletes a row for good. Only when the user asked.',
      inputSchema: { database, row: z.string().describe('Row id (from read_database)') },
      annotations: { destructiveHint: true },
    },
    async ({ database: id, row }) =>
      attempt(async () => {
        await vault.deleteDatabaseRow(id, row)
        return text('Deleted')
      }),
  )

  const folder = z
    .string()
    .describe(
      'A folder: its id, or its path of names ("Work/Tools"), made if missing; "" for the top',
    )

  server.registerTool(
    'list_bookmarks',
    {
      title: 'List bookmarks',
      description: 'All bookmarks and their folders, with ids, addresses and descriptions.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => attempt(async () => text(describeBookmarks(await vault.listBookmarks()))),
  )

  server.registerTool(
    'search_bookmarks',
    {
      title: 'Search bookmarks',
      description:
        'Searches bookmarks by title, address and description (prefixes, "phrases", -word, in:Folder; typos corrected).',
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(100).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) =>
      attempt(async () =>
        json(
          (await vault.searchBookmarks(query, limit ?? 20)).map(({ bookmark, folders }) => ({
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            description: bookmark.description,
            folders,
          })),
        ),
      ),
  )

  server.registerTool(
    'add_bookmark',
    {
      title: 'Add a bookmark',
      description:
        'Bookmarks a web page (its title, description and favicon read from it when not given). A page already bookmarked is refused, naming its bookmark. With `note`, its card is added at the end of that note.',
      inputSchema: {
        url: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        folder: folder.optional(),
        note: ref.optional().describe('A note to show its card in (at the end)'),
      },
    },
    async ({ url, title, description, folder: path, note }) =>
      attempt(async () => {
        const node = note ? await vault.resolveRef(note) : null
        const bookmark = await vault.createBookmark({ url, title, description, folder: path })
        if (node) await vault.appendContent(node.id, bookmarkBlock(bookmark.id), author)
        return json({ id: bookmark.id, title: bookmark.title, url: bookmark.url })
      }),
  )

  server.registerTool(
    'update_bookmark',
    {
      title: 'Change or move a bookmark',
      description:
        'Changes a bookmark’s title, address or description, or moves it (or a folder) to another folder. Its cards in notes show the change.',
      inputSchema: {
        bookmark: z.string().describe('Bookmark or folder id'),
        title: z.string().optional(),
        url: z.string().optional(),
        description: z.string().optional(),
        folder: folder.optional(),
      },
    },
    async ({ bookmark: id, ...patch }) =>
      attempt(async () => {
        const bookmark = await vault.updateBookmark(id, patch)
        return json({ id: bookmark.id, title: bookmark.title, url: bookmark.url })
      }),
  )

  server.registerTool(
    'delete_bookmark',
    {
      title: 'Delete a bookmark',
      description:
        'Deletes a bookmark, or a folder with everything in it, for good; its cards are removed from the notes showing them. Only when the user asked.',
      inputSchema: { bookmark: z.string().describe('Bookmark or folder id') },
      annotations: { destructiveHint: true },
    },
    async ({ bookmark: id }) =>
      attempt(async () => {
        const { deleted, pages } = await vault.deleteBookmark(id, author)
        return text(
          `Deleted ${deleted === 1 ? 'it' : `${deleted} bookmarks and folders`}${pages.length ? `; cards removed from ${pages.map((p) => p.path).join(', ')}` : ''}`,
        )
      }),
  )

  return server
}

export function createMcpRoutes(vault: Vault) {
  return new Hono().all('/', async (c) => {
    // Stateless: one server per request, which also carries the request's author.
    const author = normalizeAuthor(c.req.header(AUTHOR_HEADER), DEFAULT_AGENT)
    const server = createMcpServer(vault, author)
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return transport.handleRequest(c)
  })
}
