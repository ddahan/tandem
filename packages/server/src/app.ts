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
    app.use('/*', serveStatic({ root: webDir }))
    // Client-side routes (the app is a single-page app): always the app's shell.
    const shell = readFile(join(webDir, 'index.html'), 'utf8')
    app.get('/*', async (c) => c.html(await shell))
  }
  return app
}
