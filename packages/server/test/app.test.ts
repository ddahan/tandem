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
  it('is checked on each load, its versioned files kept for good', async () => {
    const webDir = await mkdtemp(join(tmpdir(), 'tandem-web-'))
    temporary.push(webDir)
    await mkdir(join(webDir, '_nuxt'))
    await writeFile(join(webDir, 'index.html'), '<html></html>')
    await writeFile(join(webDir, '_nuxt', 'entry.abc123.css'), 'a{}')
    const { vault } = await createTestVault()
    const app = createApp(vault, { webDir })

    for (const path of ['/', '/notes/some-id']) {
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-cache')
    }
    expect((await app.request('/_nuxt/entry.abc123.css')).headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    // The API sets its own (none here): untouched.
    expect((await app.request('/health')).headers.get('cache-control')).toBeNull()
  })
})
