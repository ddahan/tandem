// The cache of the last databases shown (RecentCache): the least recently used goes first.
import { describe, expect, it } from 'vitest'
import { RecentCache } from '../app/utils/recent-cache'

describe('RecentCache', () => {
  it('keeps the last values used, the oldest going when it is full', () => {
    const cache = new RecentCache<number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    // Read again: more recent than b.
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
  })

  it('replaces a value, and forgets one', () => {
    const cache = new RecentCache<number>(2)
    cache.set('a', 1)
    cache.set('a', 2)
    expect(cache.get('a')).toBe(2)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })
})
