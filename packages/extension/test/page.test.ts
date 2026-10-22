// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookmarkable, faviconDataUrl, pageDescription, readDescription } from '../src/page.ts'

/** Chrome's APIs the page helpers use. */
function stubChrome(executeScript: () => Promise<unknown>) {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://id${path}` },
    scripting: { executeScript },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
})

describe('reading the page', () => {
  it('reads its description from its meta tags', () => {
    expect(readDescription()).toBe('')
    document.head.innerHTML = '<meta property="og:description" content="  From   OG ">'
    expect(readDescription()).toBe('From OG')
    document.head.innerHTML +=
      '<meta name="Description" content="The page’s own"><meta name="twitter:description" content="Twitter">'
    expect(readDescription()).toBe('The page’s own')
  })

  it('bookmarks web pages only', () => {
    expect(bookmarkable('https://example.com/a')).toBe('https://example.com/a')
    expect(bookmarkable('chrome://extensions')).toBeNull()
    expect(bookmarkable(undefined)).toBeNull()
  })

  it('runs the reading in the tab, and gives nothing where pages can’t be read', async () => {
    stubChrome(async () => [{ result: 'Described' }])
    expect(await pageDescription(1)).toBe('Described')
    stubChrome(async () => {
      throw new Error('Cannot access a chrome:// URL')
    })
    expect(await pageDescription(1)).toBe('')
  })

  it('takes the favicon from the tab, or Chrome’s copy of it', async () => {
    stubChrome(async () => [])
    expect(await faviconDataUrl('https://e.com', 'data:image/png;base64,AA')).toBe(
      'data:image/png;base64,AA',
    )
    const requested: string[] = []
    const icon = (async (url: string | URL | Request) => {
      requested.push(String(url))
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    }) as typeof fetch
    expect(await faviconDataUrl('https://e.com/a', 'https://e.com/favicon.ico', icon)).toBe(
      'data:image/png;base64,AQID',
    )
    expect(requested).toEqual([
      'chrome-extension://id/_favicon/?pageUrl=https%3A%2F%2Fe.com%2Fa&size=64',
    ])
    const notImage = (async () =>
      new Response(new Blob(['x'], { type: 'text/html' }))) as unknown as typeof fetch
    expect(await faviconDataUrl('https://e.com', undefined, notImage)).toBeUndefined()
    const failing = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await faviconDataUrl('https://e.com', undefined, failing)).toBeUndefined()
  })
})
