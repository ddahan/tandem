// The whole HTTP application: API, MCP, attachment files and (in production) the built web app.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
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
    // The app's files: versioned ones (`/_nuxt/`, named by their content) are kept for good;
    // the rest (the shell, the manifest, icons) is checked on each load, so an updated app shows
    // at once instead of a window keeping an old version.
    app.use('/*', async (c, next) => {
      await next()
      if (!c.res.headers.has('cache-control')) {
        c.res.headers.set(
          'cache-control',
          c.req.path.startsWith('/_nuxt/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      }
    })
    app.use('/*', serveStatic({ root: webDir }))
    // Client-side routes (the app is a single-page app): always the app's shell.
    const shell = readFile(join(webDir, 'index.html'), 'utf8')
    app.get('/*', async (c) => c.html(await shell))
  }
  return app
}
