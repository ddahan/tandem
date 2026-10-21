// The `tandem` CLI: the same operations as the MCP server, for agents and scripts. It talks
// to a running Tandem over HTTP (the internal API), so writes go through the app: history,
// authorship and the search index stay right.
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { createClient, type Client } from '@tandem/server/client'
import {
  COLUMN_TYPES,
  cellText,
  cellsByName,
  databaseBlock,
  databaseIdsIn,
  formatDateTime,
  formatSize,
  isoDate,
  normalizeAuthor,
  rowsByName,
  viewRows,
  type ColumnType,
  type Database,
  type TreeNode,
} from '@tandem/shared'

export interface Io {
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** Reads all of standard input as text (empty when it is a terminal). */
  stdin: () => Promise<string>
  /** Reads all of standard input as bytes (attachments). */
  stdinBytes: () => Promise<Uint8Array>
  /** Reads a file, for `attach` and `--file`. */
  readFile: (path: string) => Promise<Uint8Array>
}

export const USAGE = `Usage: tandem <command> [arguments] [options]

Notes are referenced by id, path ("Projects/Roadmap") or title.

Reading
  search <query…>              full-text search (prefixes, "phrases", -word, tag:x, in:Folder)
  tree                          all pages and folders
  read <note>                   the note's Markdown (with --meta: path, tags, attachments, backlinks)
  tags [<note> [tag…]]          all tags; a note's tags; or set a note's tags
  icon <note> [emoji]           set a page's or folder's icon (--clear to remove it)
  history <note>                versions of a note
  version <version-id>          the content of a version

Writing (content from arguments, --file, or standard input)
  new <title> [content]         create a page (--parent <note>, --tags a,b)
  write <note> [content]        replace the whole content
  append <note> [content]       add a block at the end
  replace <note> --find <text> --with <text> [--all]
  rename <note> <title>         rename (links are updated)
  move <note> [--to <parent>]   move under another page or folder (default: the root)
  delete <note>                 move to the trash
  restore <note> <version-id>   restore a version
  attach <note> <file>          attach a file (--name, --insert to append its link)
  daily [content]               today's daily note (created if needed), or --date YYYY-MM-DD;
                                with content (or --file), added at its end

Databases (tables kept in Tandem; a note shows one with a \`\`\`database block)
  databases <note>              a note's databases, with their columns
  database <database>           its rows, as the saved view shows them (--all: every row)
  database-new <note> <title> <Column:type…>
                                create one, its block added at the end of the note
                                (types: text, number, date, checkbox, select=A|B|C;
                                select!=A|B: a value required, the first by default)
  row-add <database> [Column=value…]        add a row
  row-set <database> <row> <Column=value…>  change values (Column= empties one)
  row-delete <database> <row>               delete a row

Options
  --url <url>        Tandem's address (TANDEM_URL, default http://localhost:3864)
  --author <name>    who is writing, for history and authorship (TANDEM_AUTHOR, default "agent")
  --json             machine-readable output
  -h, --help         this help
`

export class CliError extends Error {}

type Values = {
  url?: string
  author?: string
  json?: boolean
  help?: boolean
  parent?: string
  tags?: string
  file?: string
  find?: string
  with?: string
  all?: boolean
  to?: string
  name?: string
  insert?: boolean
  meta?: boolean
  clear?: boolean
  limit?: string
  date?: string
}

async function call<T>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> {
  const response = await request.catch((error: unknown) => {
    throw new CliError(
      `Cannot reach Tandem (${error instanceof Error ? error.message : String(error)}). Is it running?`,
    )
  })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new CliError(
      (body as { error?: string } | null)?.error ?? `Request failed (${response.status})`,
    )
  return body as T
}

/** `Column=value` arguments, as values by column name (`Column=` empties it). */
function namedValues(args: string[]): Record<string, string | null> {
  const values: Record<string, string | null> = {}
  for (const arg of args) {
    const at = arg.indexOf('=')
    if (at <= 0) throw new CliError(`Expected Column=value, got “${arg}”.`)
    values[arg.slice(0, at)] = arg.slice(at + 1) || null
  }
  return values
}

/** `Column:type` arguments (`Status:select=To read|Done`; `select!`: a value required) as columns. */
function columnArgs(args: string[]) {
  return args.map((arg) => {
    const at = arg.lastIndexOf(':')
    const name = at > 0 ? arg.slice(0, at) : arg
    const [given = 'text', choices] = (at > 0 ? arg.slice(at + 1) : 'text').split('=')
    const required = given.endsWith('!')
    const type = required ? given.slice(0, -1) : given
    if (!COLUMN_TYPES.includes(type as ColumnType)) {
      throw new CliError(`Unknown column type “${type}” (${COLUMN_TYPES.join(', ')}).`)
    }
    return {
      name,
      type: type as ColumnType,
      ...(choices ? { options: choices.split('|') } : {}),
      ...(required ? { allowEmpty: false } : {}),
    }
  })
}

/** Text for a Markdown table cell. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** A database's rows as a Markdown table, with their ids. */
function describeRows(database: Database, all: boolean): string {
  const rows = all ? database.rows : viewRows(database)
  const header = ['id', ...database.columns.map((c) => escapeCell(c.name))]
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${[row.id, ...database.columns.map((c) => escapeCell(cellText(row.cells[c.id], c)))].join(' | ')} |`,
    ),
  ]
  const hidden = database.rows.length - rows.length
  return `${database.title || 'Untitled database'}  (${database.id})\n\n${lines.join('\n')}${hidden ? `\n\n${hidden} more hidden by the view's filters (--all to show them)` : ''}`
}

/** Values by column name as cells, the error worded for the CLI. */
function cellsOf(database: Database, values: Record<string, string | null>) {
  try {
    return cellsByName(database, values) as Record<string, string | null>
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error))
  }
}

function describeTree(nodes: TreeNode[]): string {
  const children = new Map<string | null, TreeNode[]>()
  for (const node of nodes)
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const lines: string[] = []
  const walk = (parentId: string | null, prefix: string) => {
    const list = (children.get(parentId) ?? []).toSorted((a, b) => a.position - b.position)
    list.forEach((node, index) => {
      const last = index === list.length - 1
      lines.push(
        `${prefix}${last ? '└─ ' : '├─ '}${node.kind === 'folder' ? `${node.title}/` : node.title}  (${node.id})`,
      )
      walk(node.id, `${prefix}${last ? '   ' : '│  '}`)
    })
  }
  walk(null, '')
  return lines.join('\n') || '(no notes yet)'
}

export async function run(
  argv: string[],
  io: Io,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        url: { type: 'string' },
        author: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        parent: { type: 'string' },
        tags: { type: 'string' },
        file: { type: 'string' },
        find: { type: 'string' },
        with: { type: 'string' },
        all: { type: 'boolean' },
        to: { type: 'string' },
        name: { type: 'string' },
        insert: { type: 'boolean' },
        meta: { type: 'boolean' },
        clear: { type: 'boolean' },
        limit: { type: 'string' },
        date: { type: 'string' },
      },
    })
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 2
  }
  const values = parsed.values as Values
  const [command, ...args] = parsed.positionals
  if (!command || values.help) {
    io.stdout(USAGE)
    return command || values.help ? 0 : 2
  }

  const client = createClient(values.url ?? env.TANDEM_URL ?? 'http://localhost:3864', {
    author: normalizeAuthor(values.author ?? env.TANDEM_AUTHOR),
  })
  const print = (text: string, data?: unknown) =>
    io.stdout(
      values.json && data !== undefined ? `${JSON.stringify(data, null, 2)}\n` : `${text}\n`,
    )

  try {
    await execute(command, args, values, client, io, print)
    return 0
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

async function execute(
  command: string,
  args: string[],
  values: Values,
  client: Client,
  io: Io,
  print: (text: string, data?: unknown) => void,
): Promise<void> {
  const need = (index: number, what: string): string => {
    const value = args[index]
    if (!value) throw new CliError(`Missing ${what}. See tandem --help.`)
    return value
  }
  const resolve = async (ref: string) => call(client.resolve.$get({ query: { ref } }))
  /** Content from extra arguments, --file, or standard input. */
  const content = async (from: number, required = true): Promise<string> => {
    if (args.length > from) return args.slice(from).join(' ').replace(/\\n/g, '\n')
    if (values.file) return new TextDecoder().decode(await io.readFile(values.file))
    const input = await io.stdin()
    if (!input && required)
      throw new CliError('No content: pass it as an argument, with --file, or on standard input.')
    return input
  }

  switch (command) {
    case 'daily': {
      const node = await call(
        client.calendar[':date'].$post({ param: { date: values.date ?? isoDate() } }),
      )
      // Content from arguments or --file only: an agent's standard input may never end.
      if (args.length || values.file) {
        const added = await content(0)
        await call(
          client.notes[':id'].append.$post({ param: { id: node.id }, json: { content: added } }),
        )
        return print(`Appended to ${node.path}`, node)
      }
      const note = await call(client.notes[':id'].$get({ param: { id: node.id } }))
      if (values.json) return print('', note)
      return print(`${node.path}\n---\n${note.content.replace(/\n$/, '')}`)
    }
    case 'databases': {
      const node = await resolve(need(0, 'note'))
      const note = await call(client.notes[':id'].$get({ param: { id: node.id } }))
      const list: Database[] = []
      for (const id of databaseIdsIn(note.content)) {
        list.push(await call(client.databases[':id'].$get({ param: { id } })))
      }
      const lines = list.map(
        (d) =>
          `${d.title || 'Untitled database'}  (${d.id}, ${d.rows.length} rows)\n  ${d.columns.map((c) => `${c.name}: ${c.type}${c.options ? ` (${c.options.join(', ')}${c.allowEmpty === false ? '; required' : ''})` : ''}`).join(' · ')}`,
      )
      return print(
        lines.join('\n\n') || `No databases in ${node.path}.`,
        list.map((d) => ({ id: d.id, title: d.title, columns: d.columns, rows: d.rows.length })),
      )
    }
    case 'database': {
      const database = await call(
        client.databases[':id'].$get({ param: { id: need(0, 'database id') } }),
      )
      return print(describeRows(database, values.all ?? false), {
        ...database,
        rows: rowsByName(database, values.all ?? false),
      })
    }
    case 'database-new': {
      const node = await resolve(need(0, 'note'))
      const title = need(1, 'title')
      const columns = columnArgs(args.slice(2))
      if (!columns.length) throw new CliError('Give its columns: Name:text Pages:number…')
      const database = await call(
        client.notes[':id'].databases.$post({ param: { id: node.id }, json: { title, columns } }),
      )
      await call(
        client.notes[':id'].append.$post({
          param: { id: node.id },
          json: { content: databaseBlock(database.id) },
        }),
      )
      return print(`Created ${title} (${database.id}) in ${node.path}`, database)
    }
    case 'row-add': {
      const id = need(0, 'database id')
      const database = await call(client.databases[':id'].$get({ param: { id } }))
      const cells = cellsOf(database, namedValues(args.slice(1)))
      const after = await call(
        client.databases[':id'].rows.$post({ param: { id }, json: { cells } }),
      )
      const row = after.rows.find((r) => !database.rows.some((old) => old.id === r.id))
      return print(`Added row ${row?.id ?? ''}`, row)
    }
    case 'row-set': {
      const id = need(0, 'database id')
      const rowId = need(1, 'row id')
      if (args.length < 3) throw new CliError('Give the values: Column=value…')
      const database = await call(client.databases[':id'].$get({ param: { id } }))
      const cells = cellsOf(database, namedValues(args.slice(2)))
      await call(
        client.databases[':id'].rows[':rowId'].$patch({ param: { id, rowId }, json: { cells } }),
      )
      return print(`Saved row ${rowId}`)
    }
    case 'row-delete': {
      const id = need(0, 'database id')
      const rowId = need(1, 'row id')
      await call(client.databases[':id'].rows[':rowId'].$delete({ param: { id, rowId } }))
      return print(`Deleted row ${rowId}`)
    }
    case 'search': {
      const query = args.join(' ')
      const response = await call(
        client.search.$get({ query: { q: query, limit: values.limit ?? '20' } }),
      )
      const lines = response.results.map((r) => {
        const snippet = r.snippet
          .replace(/<\/?mark>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        const extra = [
          r.tags.length ? `tags: ${r.tags.join(', ')}` : '',
          r.attachments.length ? `files: ${r.attachments.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
        return `${r.path.replace(/\.md$/, '')}  (${r.id})\n  ${snippet || '—'}${extra ? `\n  ${extra}` : ''}`
      })
      const header = response.correctedQuery
        ? `Showing results for "${response.correctedQuery}"\n\n`
        : ''
      print(`${header}${lines.join('\n\n') || 'No results.'}`, response)
      return
    }
    case 'tree': {
      const nodes = await call(client.tree.$get())
      print(describeTree(nodes), nodes)
      return
    }
    case 'read': {
      const node = await resolve(need(0, 'note'))
      const note = await call(client.notes[':id'].$get({ param: { id: node.id } }))
      if (values.json) return print('', note)
      if (!values.meta) return print(note.content.replace(/\n$/, ''))
      const backlinks = await call(client.notes[':id'].backlinks.$get({ param: { id: node.id } }))
      const meta = [
        `path: ${node.path}`,
        `id: ${node.id}`,
        `updated: ${formatDateTime(node.updatedAt)}`,
        `tags: ${note.tags.join(', ') || '—'}`,
        `attachments: ${note.attachments.map((a) => a.markdownPath).join(', ') || '—'}`,
        `linked from: ${backlinks.map((b) => b.path).join(', ') || '—'}`,
      ]
      return print(`${meta.join('\n')}\n---\n${note.content.replace(/\n$/, '')}`)
    }
    case 'tags': {
      if (!args[0]) {
        const tags = await call(client.tags.$get())
        return print(tags.map((t) => `${t.tag} (${t.count})`).join('\n') || 'No tags.', tags)
      }
      const node = await resolve(args[0])
      if (args.length === 1) {
        const note = await call(client.notes[':id'].$get({ param: { id: node.id } }))
        return print(note.tags.join(', ') || 'No tags.', note.tags)
      }
      const tags = await call(
        client.notes[':id'].tags.$put({ param: { id: node.id }, json: { tags: args.slice(1) } }),
      )
      return print(`Tags of ${node.path}: ${tags.join(', ')}`, tags)
    }
    case 'icon': {
      const node = await resolve(need(0, 'note'))
      if (values.clear) {
        const cleared = await call(client.nodes[':id'].icon.$delete({ param: { id: node.id } }))
        return print(`Removed the icon of ${node.path}`, cleared)
      }
      const updated = await call(
        client.nodes[':id'].icon.$put({
          param: { id: node.id },
          json: { emoji: need(1, 'emoji') },
        }),
      )
      return print(`Icon of ${node.path}: ${need(1, 'emoji')}`, updated)
    }
    case 'history': {
      const node = await resolve(need(0, 'note'))
      const versions = await call(client.notes[':id'].history.$get({ param: { id: node.id } }))
      return print(
        versions
          .map((v) => `${v.id}  ${formatDateTime(v.createdAt)}  ${v.author}  ${formatSize(v.size)}`)
          .join('\n') || 'No versions yet.',
        versions,
      )
    }
    case 'version': {
      const version = await call(
        client.versions[':id'].$get({ param: { id: need(0, 'version id') } }),
      )
      return print(version.content.replace(/\n$/, ''), version)
    }
    case 'new': {
      const title = need(0, 'title')
      const parentId = values.parent ? (await resolve(values.parent)).id : null
      const body = await content(1, false)
      const tags = values.tags
        ? values.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined
      const node = await call(
        client.notes.$post({ json: { title, content: body, parentId, tags } }),
      )
      return print(`Created ${node.path} (${node.id})`, node)
    }
    case 'write': {
      const node = await resolve(need(0, 'note'))
      const result = await call(
        client.notes[':id'].content.$put({
          param: { id: node.id },
          json: { content: await content(1) },
        }),
      )
      return print(`Saved ${node.path}`, result)
    }
    case 'append': {
      const node = await resolve(need(0, 'note'))
      const result = await call(
        client.notes[':id'].append.$post({
          param: { id: node.id },
          json: { content: await content(1) },
        }),
      )
      return print(`Appended to ${node.path}`, result)
    }
    case 'replace': {
      const node = await resolve(need(0, 'note'))
      if (!values.find || values.with === undefined)
        throw new CliError('replace needs --find <text> and --with <text>.')
      const result = await call(
        client.notes[':id'].replace.$post({
          param: { id: node.id },
          json: {
            find: values.find.replace(/\\n/g, '\n'),
            replace: values.with.replace(/\\n/g, '\n'),
            all: values.all,
          },
        }),
      )
      return print(`Replaced ${result.count} occurrence(s) in ${node.path}`, result)
    }
    case 'rename': {
      const node = await resolve(need(0, 'note'))
      const renamed = await call(
        client.nodes[':id'].$patch({
          param: { id: node.id },
          json: { title: need(1, 'new title') },
        }),
      )
      return print(`Renamed to ${renamed.path}`, renamed)
    }
    case 'move': {
      const node = await resolve(need(0, 'note'))
      const parentId = values.to ? (await resolve(values.to)).id : null
      const moved = await call(
        client.nodes[':id'].move.$post({ param: { id: node.id }, json: { parentId } }),
      )
      return print(`Moved to ${moved.path}`, moved)
    }
    case 'delete': {
      const node = await resolve(need(0, 'note'))
      const result = await call(client.nodes[':id'].$delete({ param: { id: node.id } }))
      return print(`Moved ${node.path} to the trash`, result)
    }
    case 'restore': {
      const node = await resolve(need(0, 'note'))
      const result = await call(
        client.notes[':id'].restore.$post({
          param: { id: node.id },
          json: { versionId: need(1, 'version id') },
        }),
      )
      return print(`Restored ${node.path}`, result)
    }
    case 'attach': {
      const node = await resolve(need(0, 'note'))
      const path = need(1, 'file (or - for standard input, with --name)')
      const name = values.name ?? (path === '-' ? undefined : basename(path))
      if (!name) throw new CliError('Give the file a --name when reading it from standard input.')
      const data = path === '-' ? await io.stdinBytes() : await io.readFile(path)
      const file = new File([data as Uint8Array<ArrayBuffer>], name)
      const attachment = await call(
        client.notes[':id'].attachments.$post({ param: { id: node.id }, form: { file, name } }),
      )
      const markdown = attachment.isImage
        ? `![${attachment.name}](${attachment.markdownPath})`
        : `[${attachment.name}](${attachment.markdownPath})`
      if (values.insert)
        await call(
          client.notes[':id'].append.$post({ param: { id: node.id }, json: { content: markdown } }),
        )
      return print(markdown, attachment)
    }
    default:
      throw new CliError(`Unknown command "${command}". See tandem --help.`)
  }
}

async function readStdin(): Promise<Uint8Array> {
  if (process.stdin.isTTY) return new Uint8Array()
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return new Uint8Array(Buffer.concat(chunks))
}

/** The real input and output of the process. */
export const processIo: Io = {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
  stdin: async () => new TextDecoder().decode(await readStdin()),
  stdinBytes: readStdin,
  readFile: async (path) => new Uint8Array(await readFile(path)),
}
