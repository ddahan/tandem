// Which tab a page is shown in (useTabs): one per note, one per app page, none for Home.
import { describe, expect, it } from 'vitest'
import { bookmarkIdOf, noteIdOf, tabKeyOf } from '../app/utils/tabs'

describe('tabs', () => {
  it('gives a note, and each app page, its own tab', () => {
    expect(tabKeyOf('/notes/k3Jd9xQe2TmA')).toBe('note:k3Jd9xQe2TmA')
    expect(tabKeyOf('/notes/k3Jd9xQe2TmA?new=1')).toBe('note:k3Jd9xQe2TmA')
    expect(tabKeyOf('/settings')).toBe('settings')
    expect(tabKeyOf('/todos')).toBe('todos')
    expect(tabKeyOf('/trash')).toBe('trash')
    expect(tabKeyOf('/bookmarks/Kx3fq9P2mZ0a')).toBe('bookmark:Kx3fq9P2mZ0a')
  })

  it('keeps Docs in one tab, whatever its section', () => {
    expect(tabKeyOf('/docs')).toBe('docs')
    expect(tabKeyOf('/docs/blocks')).toBe('docs')
  })

  it('gives Home and unknown pages no tab', () => {
    expect(tabKeyOf('/')).toBeNull()
    expect(tabKeyOf('/settingsx')).toBeNull()
    expect(tabKeyOf('/landing')).toBeNull()
  })

  it('reads the note of a tab', () => {
    expect(noteIdOf('note:abc')).toBe('abc')
    expect(noteIdOf('settings')).toBeNull()
    expect(noteIdOf('bookmark:abc')).toBeNull()
  })

  it('reads the bookmark of a tab', () => {
    expect(bookmarkIdOf('bookmark:abc')).toBe('abc')
    expect(bookmarkIdOf('note:abc')).toBeNull()
  })
})
