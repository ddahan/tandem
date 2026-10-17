import { describe, expect, it } from 'vitest'
import {
  assetsDirOf,
  authorLabel,
  childrenDirOf,
  decodeMarkdownPath,
  dirnameOf,
  encodeMarkdownPath,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatSize,
  isImageFile,
  linkKey,
  maskCode,
  normalizeAuthor,
  parseWikiLinks,
  rewriteWikiLinks,
  sanitizeTitle,
  titleFromPath,
} from '../src/index.ts'

describe('titles', () => {
  it('replaces characters that are invalid in file names', () => {
    expect(sanitizeTitle('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('trims, collapses spaces and strips leading and trailing dots', () => {
    expect(sanitizeTitle('  ..Hidden   note.  ')).toBe('Hidden note')
  })

  it('never returns an empty title nor a reserved suffix', () => {
    expect(sanitizeTitle('  ')).toBe('Untitled')
    expect(sanitizeTitle('Foo.assets')).toBe('Foo')
    expect(sanitizeTitle('Foo.md')).toBe('Foo')
  })

  it('limits the length', () => {
    expect(sanitizeTitle('x'.repeat(300))).toHaveLength(120)
  })

  it('derives related paths', () => {
    expect(titleFromPath('A/B/Foo.md')).toBe('Foo')
    expect(titleFromPath('A/B')).toBe('B')
    expect(assetsDirOf('A/Foo.md')).toBe('A/Foo.assets')
    expect(childrenDirOf('A/Foo.md')).toBe('A/Foo')
    expect(dirnameOf('A/Foo.md')).toBe('A')
    expect(dirnameOf('Foo.md')).toBe('')
  })

  it('recognizes images and encodes Markdown paths', () => {
    expect(isImageFile('photo.JPG')).toBe(true)
    expect(isImageFile('report.pdf')).toBe(false)
    expect(encodeMarkdownPath('My note.assets/a b#1.png')).toBe('My%20note.assets/a%20b%231.png')
    expect(decodeMarkdownPath('My%20note.assets/a%20b%231.png')).toBe('My note.assets/a b#1.png')
    expect(decodeMarkdownPath('bad%zz')).toBe('bad%zz')
  })
})

describe('wiki links', () => {
  it('parses targets, labels and headings', () => {
    const links = parseWikiLinks('See [[Foo]], [[A/Bar#Intro|the bar]] and [[ Baz |x]].')
    expect(links.map((l) => [l.target, l.heading, l.label])).toEqual([
      ['Foo', null, null],
      ['A/Bar', 'Intro', 'the bar'],
      ['Baz', null, 'x'],
    ])
  })

  it('ignores links in code', () => {
    const text = 'a `[[Inline]]` b\n```\n[[Fenced]]\n```\n[[Real]]'
    expect(parseWikiLinks(text).map((l) => l.target)).toEqual(['Real'])
    expect(maskCode(text)).toHaveLength(text.length)
  })

  it('compares targets without case nor accents', () => {
    expect(linkKey('Été/Café.md')).toBe('ete/cafe')
  })

  it('rewrites matching links only, keeping labels and headings', () => {
    const text = '[[Old]] [[old#H|label]] [[Older]] `[[Old]]`'
    expect(rewriteWikiLinks(text, 'Old', 'New')).toBe('[[New]] [[New#H|label]] [[Older]] `[[Old]]`')
    expect(rewriteWikiLinks('nothing', 'Old', 'New')).toBe('nothing')
  })
})

describe('authors', () => {
  it('normalizes agent names', () => {
    expect(normalizeAuthor('Claude Code')).toBe('claude-code')
    expect(normalizeAuthor('  ')).toBe('agent')
    expect(normalizeAuthor(undefined, 'owner')).toBe('owner')
  })

  it('labels authors', () => {
    expect(authorLabel('owner', 'David')).toBe('David')
    expect(authorLabel('owner', '')).toBe('Me')
    expect(authorLabel('external', 'David')).toBe('External edit')
    expect(authorLabel('claude', 'David')).toBe('Claude')
  })
})

describe('French formats', () => {
  const date = new Date(2026, 9, 7, 9, 5).getTime()

  it('formats dates and numbers', () => {
    expect(formatDate(date)).toBe('07/10/2026')
    expect(formatDateTime(date)).toBe('07/10/2026 09:05')
    expect(formatNumber(1234.5)).toBe('1 234,5')
  })

  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 o')
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2,5 Mo')
    expect(formatSize(15 * 1024 * 1024)).toBe('15 Mo')
  })

  it('formats relative times', () => {
    expect(formatRelative(date, date + 10_000)).toBe('just now')
    expect(formatRelative(date, date + 5 * 60_000)).toBe('5 min ago')
    expect(formatRelative(date, date + 3 * 3600_000)).toBe('3 h ago')
    expect(formatRelative(date, date + 3 * 86_400_000)).toBe('07/10/2026 09:05')
  })
})
