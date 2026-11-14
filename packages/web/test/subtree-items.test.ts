import { describe, expect, it } from 'vitest'
import { sortSubtreeItems, type SubtreeSort } from '../app/utils/subtree-items'

const items = [
  { key: 'a', order: 0, label: 'photo 10.png', detail: '', size: 300, type: 'png' },
  { key: 'b', order: 1, label: 'Photo 2.png', detail: '', size: 900, type: 'png' },
  { key: 'c', order: 10_000, label: 'notes.txt', detail: '', size: 900, type: 'txt' },
  { key: 'd', order: 10_001, label: 'archive.zip', detail: '', size: 50, type: 'zip' },
]
const keys = (sort: SubtreeSort) => sortSubtreeItems(items, sort).map((item) => item.key)

describe('the flat display’s sorting', () => {
  it('sorts by page, name, size and type', () => {
    expect(keys('page')).toEqual(['a', 'b', 'c', 'd'])
    // Names as people read them: any case, numbers by value.
    expect(keys('name')).toEqual(['d', 'c', 'b', 'a'])
    // The largest first, ties in the tree's order.
    expect(keys('size')).toEqual(['b', 'c', 'a', 'd'])
    expect(keys('type')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('sorts by site and rows', () => {
    const list = [
      { key: 'x', order: 0, label: 'X', detail: '', site: 'zeta.com', rows: 1 },
      { key: 'y', order: 1, label: 'Y', detail: '', site: 'alpha.com', rows: 5 },
    ]
    expect(sortSubtreeItems(list, 'site').map((item) => item.key)).toEqual(['y', 'x'])
    expect(sortSubtreeItems(list, 'rows').map((item) => item.key)).toEqual(['y', 'x'])
  })
})
