// Who may talk to Tandem. It has no authentication and listens on the computer only, but any
// web page the owner visits can send requests to localhost, so two checks run on every request:
//
// - The Host: only Tandem's own names (localhost, 127.0.0.1, [::1]; plus `allowedHosts`, e.g.
//   the dev servers' container name). A page on evil.example whose name is then pointed at
//   127.0.0.1 (DNS rebinding) is its own origin for the browser, so it could read the answers;
//   its requests still name evil.example, and are refused.
// - The Origin, on writes (anything but GET and HEAD): none (the CLI, agents), a page served from
//   the computer (the app itself, its dev server), or Tandem's browser extension. Other pages
//   can't read answers (no CORS headers), but could still send a form or an upload blindly.
import type { MiddlewareHandler } from 'hono'
import { EXTENSION_ORIGIN } from '@tandem/shared'

export interface GuardOptions {
  /** Host names allowed besides the computer's own (TANDEM_ALLOWED_HOSTS). */
  allowedHosts?: string[]
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** A name of this computer: localhost (and its subdomains), or a loopback address. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost')
}

/** Whether a write may come from this Origin header (absent: not a web page). */
export function isTrustedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true
  if (origin === EXTENSION_ORIGIN) return true
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLocalHost(url.hostname)
  } catch {
    // "null" (a sandboxed frame, a file) and anything unreadable.
    return false
  }
}

export function guard(options: GuardOptions = {}): MiddlewareHandler {
  const extra = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase()))
  return async (c, next) => {
    const { hostname } = new URL(c.req.url)
    if (!isLocalHost(hostname) && !extra.has(hostname.toLowerCase())) {
      return c.json({ error: `Tandem only answers to localhost, not to ${hostname}` }, 403)
    }
    const write = c.req.method !== 'GET' && c.req.method !== 'HEAD'
    if (write && !isTrustedOrigin(c.req.header('origin'))) {
      return c.json({ error: 'Tandem only accepts changes from itself and its extension' }, 403)
    }
    await next()
  }
}
