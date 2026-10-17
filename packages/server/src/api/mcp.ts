// MCP server (Streamable HTTP, stateless) at `/mcp`, so agents can read and write notes:
//   claude mcp add --transport http myfluence http://localhost:3000/mcp \
//     --header "X-Myfluence-Author: claude"
// The author header names the agent in history and authorship (default: `agent`).
import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { z } from 'zod'
import { DEFAULT_AGENT, formatDateTime, normalizeAuthor, type TreeNode } from '@myfluence/shared'
import type { Vault } from '../vault/vault.ts'
import { AUTHOR_HEADER } from './index.ts'

const INSTRUCTIONS = `Myfluence is the user's note-taking app. Notes are Markdown pages in a tree
(a page can have child pages), with tags, history and per-line authorship. Notes are referenced by
id, path ("Projects/Roadmap") or title. Links between notes are written [[Title]] or
[[Folder/Title]]. Prefer small edits (append_to_note, replace_in_note) over rewriting whole notes,
so that the user's lines keep their authorship. Never delete notes unless the user asked.`

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

export function createMcpServer(vault: Vault, author: string): McpServer {
  const server = new McpServer(
    { name: 'myfluence', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
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
        'Creates a page (optionally under a parent page or folder). Returns its id and path.',
      inputSchema: {
        title: z.string(),
        content: z.string().optional().describe('Markdown (GFM)'),
        parent: ref.optional().describe('Parent page or folder; omit for the root'),
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
    'create_folder',
    {
      title: 'Create a folder',
      description: 'Creates a folder (a tree node without content).',
      inputSchema: { title: z.string(), parent: ref.optional() },
    },
    async ({ title, parent }) =>
      attempt(async () => {
        const parentId = parent ? (await vault.resolveRef(parent)).id : null
        return json(await vault.createFolder({ title, parentId }))
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
