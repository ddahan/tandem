import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createTestVault } from './helpers.ts'

const temporary: string[] = []
afterEach(async () => {
  while (temporary.length) await rm(temporary.pop()!, { recursive: true, force: true })
})

describe('the web app', () => {
  it('is never stored, its files checked on each load (304 when unchanged)', async () => {
    const webDir = await mkdtemp(join(tmpdir(), 'tandem-web-'))
    temporary.push(webDir)
    await mkdir(join(webDir, '_app'))
    await writeFile(join(webDir, 'index.html'), '<html></html>')
    await writeFile(join(webDir, '_app', 'entry.abc123.css'), 'a{}')
    const { vault } = await createTestVault()
    const app = createApp(vault, { webDir })

    // Pages: never stored (a reopened window must not show an old version).
    for (const path of ['/', '/notes/some-id']) {
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    // Their files: checked on each load, a 304 when unchanged.
    const response = await app.request('/_app/entry.abc123.css')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-cache')
    const before = response.headers.get('etag')
    expect(before).toBeTruthy()
    const again = await app.request('/_app/entry.abc123.css', {
      headers: { 'If-None-Match': before! },
    })
    expect(again.status).toBe(304)
    // Content-named files too: a script can change and keep its name (see app.ts).
    await writeFile(join(webDir, '_app', 'entry.abc123.css'), 'b{}')
    const changed = await app.request('/_app/entry.abc123.css', {
      headers: { 'If-None-Match': before! },
    })
    expect(changed.status).toBe(200)
    expect(await changed.text()).toBe('b{}')
    // The API sets its own (none here): untouched.
    expect((await app.request('/health')).headers.get('cache-control')).toBeNull()
  })
})
