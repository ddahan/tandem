import { describe, expect, it } from 'vitest'
import { EXTENSION_ORIGIN } from '@tandem/shared'
import { isLocalHost, isTrustedOrigin } from '../src/api/guard.ts'
import { createApp } from '../src/app.ts'
import { createTestVault } from './helpers.ts'

describe('guard', () => {
  it('answers to the computer’s own names only (DNS rebinding)', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    for (const host of ['localhost:3864', '127.0.0.1:3864', '[::1]:3864', 'tandem.localhost']) {
      expect((await app.request(`http://${host}/api/tree`)).status).toBe(200)
    }
    const response = await app.request('http://attacker.example:3864/api/tree')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('localhost') })
    // MCP and files too.
    expect((await app.request('http://attacker.example/mcp', { method: 'POST' })).status).toBe(403)
    expect((await app.request('http://attacker.example/files/a.md')).status).toBe(403)
  })

  it('answers to names it is told to (the dev servers’ container)', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault, { allowedHosts: ['server'] })
    expect((await app.request('http://server:3011/api/tree')).status).toBe(200)
    expect((await app.request('http://other:3011/api/tree')).status).toBe(403)
  })

  it('accepts changes from itself, the CLI and the extension, never from other sites', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    const post = (origin?: string) =>
      app.request('http://localhost/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
        body: JSON.stringify({ title: 'Note' }),
      })
    expect((await post()).status).toBe(201)
    expect((await post('http://localhost:3864')).status).toBe(201)
    expect((await post('http://localhost:3010')).status).toBe(201)
    expect((await post(EXTENSION_ORIGIN)).status).toBe(201)
    for (const origin of [
      'https://attacker.example',
      'chrome-extension://otherextensionidxxxxxxxxxxxxxxxx',
      'null',
    ]) {
      const response = await post(origin)
      expect(response.status).toBe(403)
    }
    // Reading is allowed from anywhere on the computer's names: browsers keep answers from
    // other sites anyway.
    const read = await app.request('http://localhost/api/tree', {
      headers: { origin: 'https://attacker.example' },
    })
    expect(read.status).toBe(200)
  })

  it('tells local names and trusted origins apart', () => {
    expect(isLocalHost('LOCALHOST')).toBe(true)
    expect(isLocalHost('app.localhost')).toBe(true)
    expect(isLocalHost('localhost.example')).toBe(false)
    expect(isTrustedOrigin(undefined)).toBe(true)
    expect(isTrustedOrigin('http://127.0.0.1:3864')).toBe(true)
    expect(isTrustedOrigin('ftp://localhost')).toBe(false)
    expect(isTrustedOrigin('not a url')).toBe(false)
  })
})
