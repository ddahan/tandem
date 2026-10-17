// The internal HTTP API, used by the web app and the CLI (through the typed client in
// `../client.ts`). It is not a public API: routes change with the app's needs.
//
// Who is writing comes from the `X-Myfluence-Author` header: the web app sends `owner`, the CLI
// the agent's name; without it, writes are credited to a generic `agent`.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { zValidator as baseValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getMimeType } from 'hono/utils/mime'
import { z } from 'zod'
import { DEFAULT_AGENT, normalizeAuthor, type ServerEvent } from '@myfluence/shared'
import { ConflictError, NotFoundError, ValidationError } from '../vault/errors.ts'
import type { Vault } from '../vault/vault.ts'

export const AUTHOR_HEADER = 'x-myfluence-author'

type Target = 'json' | 'query' | 'param' | 'form'

/** Validation errors go through `onError` (400 with a readable message). */
function zValidator<T extends z.ZodType, K extends Target>(target: K, schema: T) {
  return baseValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      throw new ValidationError(
        issue ? `${issue.path.join('.') || target}: ${issue.message}` : 'Invalid request',
      )
    }
  })
}

function authorOf(c: Context): string {
  return normalizeAuthor(c.req.header(AUTHOR_HEADER), DEFAULT_AGENT)
}

const idParam = z.object({ id: z.string().min(1) })

const settingsPatch = z
  .object({
    displayName: z.string().max(60),
    primaryColor: z.string().regex(/^[a-z]+$/),
    neutralColor: z.string().regex(/^[a-z]+$/),
    radius: z.number().min(0).max(1),
    editorFont: z.enum(['sans', 'serif', 'mono', 'system']),
    editorWidth: z.enum(['narrow', 'medium', 'wide', 'full']),
    editorFontSize: z.enum(['small', 'medium', 'large', 'xlarge']),
  })
  .partial()

export function createApi(vault: Vault) {
  const api = new Hono()
    .onError((error, c) => {
      if (error instanceof NotFoundError) return c.json({ error: error.message }, 404)
      if (error instanceof ConflictError) {
        return c.json({ error: error.message, current: error.current ?? null }, 409)
      }
      if (error instanceof ValidationError) return c.json({ error: error.message }, 400)
      console.error(error)
      return c.json({ error: 'Internal error' }, 500)
    })

    // --- Tree and notes ------------------------------------------------------------------
    .get('/tree', async (c) => c.json(await vault.tree()))
    .get('/resolve', zValidator('query', z.object({ ref: z.string().min(1) })), async (c) =>
      c.json(await vault.resolveRef(c.req.valid('query').ref)),
    )
    .get(
      '/links/resolve',
      zValidator('query', z.object({ target: z.string().min(1) })),
      async (c) => c.json({ node: await vault.resolveLink(c.req.valid('query').target) }),
    )
    .post(
      '/notes',
      zValidator(
        'json',
        z.object({
          parentId: z.string().nullish(),
          title: z.string().default('Untitled'),
          content: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      ),
      async (c) =>
        c.json(await vault.createPage({ ...c.req.valid('json'), author: authorOf(c) }), 201),
    )
    .post(
      '/folders',
      zValidator(
        'json',
        z.object({ parentId: z.string().nullish(), title: z.string().default('New folder') }),
      ),
      async (c) => c.json(await vault.createFolder(c.req.valid('json')), 201),
    )
    .get('/notes/:id', zValidator('param', idParam), async (c) =>
      c.json(await vault.getNote(c.req.valid('param').id)),
    )
    .put(
      '/notes/:id/content',
      zValidator('param', idParam),
      zValidator('json', z.object({ content: z.string(), baseHash: z.string().optional() })),
      async (c) => {
        const { content, baseHash } = c.req.valid('json')
        return c.json(
          await vault.saveContent(c.req.valid('param').id, content, {
            author: authorOf(c),
            baseHash,
          }),
        )
      },
    )
    .post(
      '/notes/:id/append',
      zValidator('param', idParam),
      zValidator('json', z.object({ content: z.string().min(1) })),
      async (c) =>
        c.json(
          await vault.appendContent(
            c.req.valid('param').id,
            c.req.valid('json').content,
            authorOf(c),
          ),
        ),
    )
    .post(
      '/notes/:id/replace',
      zValidator('param', idParam),
      zValidator(
        'json',
        z.object({ find: z.string().min(1), replace: z.string(), all: z.boolean().optional() }),
      ),
      async (c) => {
        const { find, replace, all } = c.req.valid('json')
        return c.json(
          await vault.replaceText(c.req.valid('param').id, find, replace, {
            author: authorOf(c),
            all,
          }),
        )
      },
    )
    .patch(
      '/nodes/:id',
      zValidator('param', idParam),
      zValidator('json', z.object({ title: z.string().min(1) })),
      async (c) =>
        c.json(await vault.rename(c.req.valid('param').id, c.req.valid('json').title, authorOf(c))),
    )
    .post(
      '/nodes/:id/move',
      zValidator('param', idParam),
      zValidator(
        'json',
        z.object({ parentId: z.string().nullable(), index: z.number().int().min(0).optional() }),
      ),
      async (c) =>
        c.json(await vault.move(c.req.valid('param').id, c.req.valid('json'), authorOf(c))),
    )
    .delete('/nodes/:id', zValidator('param', idParam), async (c) =>
      c.json(await vault.remove(c.req.valid('param').id)),
    )

    // --- Tags, links, attachments ----------------------------------------------------------
    .get('/tags', async (c) => c.json(await vault.listTags()))
    .put(
      '/notes/:id/tags',
      zValidator('param', idParam),
      zValidator('json', z.object({ tags: z.array(z.string().max(60)).max(50) })),
      async (c) => c.json(await vault.setTags(c.req.valid('param').id, c.req.valid('json').tags)),
    )
    .get('/notes/:id/backlinks', zValidator('param', idParam), async (c) =>
      c.json(await vault.backlinks(c.req.valid('param').id)),
    )
    .get('/notes/:id/attachments', zValidator('param', idParam), async (c) =>
      c.json(await vault.attachments(c.req.valid('param').id)),
    )
    .post(
      '/notes/:id/attachments',
      zValidator('param', idParam),
      zValidator('form', z.object({ file: z.instanceof(File), name: z.string().optional() })),
      async (c) => {
        const { file, name } = c.req.valid('form')
        const data = new Uint8Array(await file.arrayBuffer())
        return c.json(
          await vault.addAttachment(c.req.valid('param').id, name || file.name, data),
          201,
        )
      },
    )

    // --- History and authorship ----------------------------------------------------------
    .get('/notes/:id/history', zValidator('param', idParam), async (c) =>
      c.json(await vault.history(c.req.valid('param').id)),
    )
    .get('/versions/:id', zValidator('param', idParam), async (c) =>
      c.json(await vault.readVersion(c.req.valid('param').id)),
    )
    .post(
      '/notes/:id/restore',
      zValidator('param', idParam),
      zValidator('json', z.object({ versionId: z.string().min(1) })),
      async (c) =>
        c.json(
          await vault.restoreVersion(
            c.req.valid('param').id,
            c.req.valid('json').versionId,
            authorOf(c),
          ),
        ),
    )
    .get('/notes/:id/blame', zValidator('param', idParam), async (c) =>
      c.json(await vault.blame(c.req.valid('param').id)),
    )

    // --- Search ----------------------------------------------------------------------------
    .get(
      '/search',
      zValidator(
        'query',
        z.object({
          q: z.string().default(''),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      ),
      async (c) => {
        const { q, limit } = c.req.valid('query')
        return c.json(await vault.searchNotes(q, limit))
      },
    )

    // --- Trash -----------------------------------------------------------------------------
    .get('/trash', async (c) => c.json(await vault.trashList()))
    .post('/trash/:id/restore', zValidator('param', idParam), async (c) =>
      c.json(await vault.restoreFromTrash(c.req.valid('param').id)),
    )
    .delete('/trash/:id', zValidator('param', idParam), async (c) => {
      await vault.deleteFromTrash(c.req.valid('param').id)
      return c.json({ ok: true })
    })
    .delete('/trash', async (c) => c.json({ deleted: await vault.emptyTrash() }))

    // --- Settings ----------------------------------------------------------------------------
    .get('/settings', async (c) => c.json(await vault.getSettings()))
    .patch('/settings', zValidator('json', settingsPatch), async (c) =>
      c.json(await vault.updateSettings(c.req.valid('json'))),
    )

    // --- Live updates ------------------------------------------------------------------------
    .get('/events', (c) =>
      streamSSE(c, async (stream) => {
        const send = (event: ServerEvent) => void stream.writeSSE({ data: JSON.stringify(event) })
        vault.events.on('event', send)
        stream.onAbort(() => {
          vault.events.off('event', send)
        })
        while (!stream.aborted) {
          await stream.writeSSE({ event: 'ping', data: '' })
          await stream.sleep(25_000)
        }
      }),
    )

  return api
}

/** Serves files of the data folder (attachments) at `/files/<path>`, never hidden ones. */
export function createFileRoutes(vault: Vault) {
  return new Hono().get('/*', async (c) => {
    const relative = decodeURIComponent(c.req.path.replace(/^\/files\//, ''))
    const clean = normalize(relative)
    if (clean.startsWith('..') || clean.split('/').some((segment) => segment.startsWith('.'))) {
      return c.json({ error: 'Not found' }, 404)
    }
    const path = join(vault.dataDir, clean)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) return c.json({ error: 'Not found' }, 404)
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    c.header('Content-Type', getMimeType(clean) ?? 'application/octet-stream')
    c.header('Content-Length', String(info.size))
    c.header('ETag', etag)
    c.header('Cache-Control', 'no-cache')
    // SVGs can carry scripts: never run them in the app's origin.
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    )
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream)
  })
}

export type Api = ReturnType<typeof createApi>
