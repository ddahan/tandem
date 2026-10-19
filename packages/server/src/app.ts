// The whole HTTP application: API, MCP, attachment files and (in production) the built web app.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { etag } from 'hono/etag'
import { createApi, createFileRoutes, type ApiOptions } from './api/index.ts'
import { createMcpRoutes } from './api/mcp.ts'
import type { Vault } from './vault/vault.ts'

export function createApp(vault: Vault, options: { webDir?: string } & ApiOptions = {}) {
  const app = new Hono()
    .route('/api', createApi(vault, options))
    .route('/mcp', createMcpRoutes(vault))
    .route('/files', createFileRoutes(vault))
    .get('/health', (c) => c.json({ ok: true }))

  const webDir = options.webDir
  if (webDir && existsSync(webDir)) {
    // The app's files are checked on each load (an ETag makes it a 304), so an updated app shows
    // at once. Even the ones named by their content: Vite writes stylesheet names into scripts
    // after naming them, so a script can change and keep its name (a browser keeping it for good
    // mixed versions: a fixed style undone by the old one). Pages are never stored: a browser
    // reopening a window (Safari's Dock apps) showed a stored page, so the old version.
    app.use('/*', async (c, next) => {
      await next()
      if (!c.res.headers.has('cache-control')) {
        const page = c.res.headers.get('content-type')?.startsWith('text/html')
        c.res.headers.set('cache-control', page ? 'no-store' : 'no-cache')
      }
    })
    app.use('/*', etag())
    app.use('/*', serveStatic({ root: webDir }))
    // Client-side routes (the app is a single-page app): always the app's shell.
    const shell = readFile(join(webDir, 'index.html'), 'utf8')
    app.get('/*', async (c) => c.html(await shell))
  }
  return app
}
