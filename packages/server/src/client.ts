// Typed client of the internal API (Hono RPC), shared by the web app and the CLI.
import { hc } from 'hono/client'
import type { Api } from './api/index.ts'

export type { Api }

export function createClient(baseUrl: string, options?: { author?: string; fetch?: typeof fetch }) {
  return hc<Api>(`${baseUrl.replace(/\/$/, '')}/api`, {
    headers: options?.author ? { 'x-myfluence-author': options.author } : {},
    fetch: options?.fetch,
  })
}

export type Client = ReturnType<typeof createClient>
