import { describe, expect, it } from 'vitest'
import {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  bookmarkBlock,
  bookmarkIdsIn,
  removeBookmarkBlocks,
  siteOf,
  urlKey,
  webUrl,
} from '../src/bookmarks.ts'

describe('bookmarks', () => {
  it('takes web addresses only, adding https:// when there is no scheme', () => {
    expect(webUrl('  example.com/a b ')).toBe('https://example.com/a%20b')
    expect(webUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x')
    expect(webUrl('HTTPS://Example.COM')).toBe('https://example.com/')
    expect(webUrl('')).toBeNull()
    expect(webUrl('javascript:alert(1)')).toBeNull()
    expect(webUrl('file:///etc/passwd')).toBeNull()
    expect(webUrl('mailto:me@example.com')).toBeNull()
    expect(webUrl('https://')).toBeNull()
    expect(webUrl(`https://example.com/${'a'.repeat(5000)}`)).toBeNull()
  })

  it('tells duplicates by address, give or take www, the scheme, #… and a final /', () => {
    const key = urlKey('https://www.Example.com/docs/?q=1#top')
    expect(urlKey('http://example.com/docs?q=1')).toBe(key)
    expect(urlKey('https://example.com/Docs?q=1')).not.toBe(key)
    expect(urlKey('https://example.com:8080/')).toBe('example.com:8080')
    expect(urlKey(' not a url ')).toBe('not a url')
  })

  it('names the site', () => {
    expect(siteOf('https://www.github.com/ddahan')).toBe('github.com')
    expect(siteOf('nope')).toBe('nope')
  })

  it('finds and removes bookmark blocks', () => {
    const markdown = `# Links\n\n${bookmarkBlock('a1')}\n\nText\n\n${bookmarkBlock('b2')}\n\n\`\`\`bookmark\nno id\n\`\`\`\n`
    expect(bookmarkIdsIn(markdown)).toEqual(['a1', 'b2'])
    expect(removeBookmarkBlocks(markdown, ['a1'])).toBe(
      `# Links\n\nText\n\n${bookmarkBlock('b2')}\n\n\`\`\`bookmark\nno id\n\`\`\`\n`,
    )
    expect(removeBookmarkBlocks(`${bookmarkBlock('b2')}\n\nAfter`, ['b2'])).toBe('After')
    expect(removeBookmarkBlocks(markdown, ['zz'])).toBe(markdown)
  })

  it('knows the extension', () => {
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/)
    expect(EXTENSION_ORIGIN).toBe(`chrome-extension://${EXTENSION_ID}`)
  })
})
