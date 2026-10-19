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
  it('is checked on each load, its unchanged files answered with a 304', async () => {
    const webDir = await mkdtemp(join(tmpdir(), 'tandem-web-'))
    temporary.push(webDir)
    await mkdir(join(webDir, '_app'))
    await writeFile(join(webDir, 'index.html'), '<html></html>')
    await writeFile(join(webDir, '_app', 'entry.abc123.css'), 'a{}')
    const { vault } = await createTestVault()
    const app = createApp(vault, { webDir })

    for (const path of ['/', '/notes/some-id', '/_app/entry.abc123.css']) {
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-cache')
      const tag = response.headers.get('etag')
      expect(tag).toBeTruthy()
      const again = await app.request(path, { headers: { 'If-None-Match': tag! } })
      expect(again.status).toBe(304)
    }
    // Content-named files too: a script can change and keep its name (see app.ts).
    const before = (await app.request('/_app/entry.abc123.css')).headers.get('etag')
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
